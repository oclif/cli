import {Command, flags} from '@oclif/command'
import * as qq from 'qqjs'

import aws from '../../aws'
import {log} from '../../log'
import * as Tarballs from '../../tarballs'
import {commitAWSDir, templateShortKey} from '../../upload-util'

export default class UploadWin extends Command {
  static hidden = true

  static description = 'upload windows installers built with pack:win'

  static flags = {
    root: flags.string({char: 'r', description: 'path to oclif CLI root', default: '.', required: true}),
  }

  async run() {
    const {flags} = this.parse(UploadWin)
    const buildConfig = await Tarballs.buildConfig(flags.root)
    const {s3Config, version, config, dist, gitSha, targets} = buildConfig
    const S3Options = {
      Bucket: s3Config.bucket!,
      ACL: s3Config.acl || 'public-read',
    }

    const archs = targets.filter(t => t.platform === 'win32').map(t => t.arch)
    for (const arch of archs) {
      const templateKey = templateShortKey('win32', {bin: config.bin, version: version, sha: gitSha, arch})
      const localKey = dist(`win32/${templateKey}`)
      // eslint-disable-next-line no-await-in-loop
      if (!await qq.exists(localKey)) this.error(`Cannot find Windows exe for ${arch}`, {
        suggestions: ['Run "oclif-dev pack:win" before uploading'],
      })
    }

    const cloudKeyBase = commitAWSDir(config.pjson.version, gitSha, s3Config)
    const uploadWin = async (arch: 'x64' | 'x86') => {
      const templateKey = templateShortKey('win32', {bin: config.bin, version: version, sha: gitSha, arch})
      const localExe = dist(`win32/${templateKey}`)
      const cloudKey = `${cloudKeyBase}/${templateKey}`
      if (await qq.exists(localExe)) await aws.s3.uploadFile(localExe, {...S3Options, CacheControl: 'max-age=86400', Key: cloudKey})
    }

    await uploadWin('x64')
    await uploadWin('x86')

    log(`done uploading windows executables for v${version}-${gitSha}`)
  }
}
