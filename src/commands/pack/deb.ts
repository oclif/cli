import {Command, Flags} from '@oclif/core'
import {Interfaces} from '@oclif/core'
import * as fs from 'fs-extra'
import * as _ from 'lodash'
import * as path from 'path'
import * as Tarballs from '../../tarballs'
import {templateShortKey, debVersion, debArch} from '../../upload-util'
import {exec as execSync} from 'child_process'
import {promisify} from 'node:util'

const exec = promisify(execSync)

const scripts = {
  /* eslint-disable no-useless-escape */
  bin: (config: Interfaces.Config,
  ) => `#!/usr/bin/env bash
set -e
echoerr() { echo "$@" 1>&2; }
get_script_dir () {
  SOURCE="\${BASH_SOURCE[0]}"
  # While \$SOURCE is a symlink, resolve it
  while [ -h "\$SOURCE" ]; do
    DIR="\$( cd -P "\$( dirname "\$SOURCE" )" && pwd )"
    SOURCE="\$( readlink "\$SOURCE" )"
    # If \$SOURCE was a relative symlink (so no "/" as prefix, need to resolve it relative to the symlink base directory
    [[ \$SOURCE != /* ]] && SOURCE="\$DIR/\$SOURCE"
  done
  DIR="\$( cd -P "\$( dirname "\$SOURCE" )" && pwd )"
  echo "\$DIR"
}
DIR=\$(get_script_dir)
export ${config.scopedEnvVarKey('UPDATE_INSTRUCTIONS')}="update with \\"sudo apt update && sudo apt install ${config.bin}\\""
\$DIR/node \$DIR/run "\$@"
`,
  /* eslint-enable no-useless-escape */
  control: (config: Tarballs.BuildConfig, arch: string) => `Package: ${config.config.bin}
Version: ${debVersion(config)}
Section: main
Priority: standard
Architecture: ${arch}
Maintainer: ${config.config.scopedEnvVar('AUTHOR') || config.config.pjson.author}
Description: ${config.config.pjson.description}
`,
  ftparchive: (config: Interfaces.Config,
  ) => `
APT::FTPArchive::Release {
  Origin "${config.scopedEnvVar('AUTHOR') || config.pjson.author}";
  Suite  "stable";
`,
}

export default class PackDeb extends Command {
  static description = 'pack CLI into debian package'

  static flags = {
    root: Flags.string({char: 'r', description: 'path to oclif CLI root', default: '.', required: true}),
    tarball: Flags.string({char: 't', description: 'optionally specify a path to a tarball already generated by NPM', required: false}),
  }

  async run(): Promise<void> {
    if (process.platform !== 'linux') throw new Error('debian packing must be run on linux')
    const {flags} = await this.parse(PackDeb)
    const buildConfig = await Tarballs.buildConfig(flags.root)
    const {config} = buildConfig
    await Tarballs.build(buildConfig, {platform: 'linux', pack: false, tarball: flags.tarball})
    const dist = buildConfig.dist('deb')
    await fs.emptyDir(dist)
    const build = async (arch: Interfaces.ArchTypes) => {
      const target: { platform: 'linux'; arch: Interfaces.ArchTypes} = {platform: 'linux', arch}
      const versionedDebBase = templateShortKey('deb', {bin: config.bin, versionShaRevision: debVersion(buildConfig), arch: debArch(arch) as any})
      const workspace = path.join(buildConfig.tmp, 'apt', versionedDebBase.replace('.deb', '.apt'))
      await fs.promises.rm(workspace, {recursive: true})
      await Promise.all([
        fs.promises.mkdir(path.join(workspace, 'DEBIAN'), {recursive: true}),
        fs.promises.mkdir(path.join(workspace, 'usr', 'bin'), {recursive: true}),
        fs.promises.mkdir(path.join(workspace, 'usr', 'lib', config.dirname, 'bin'), {recursive: true}),
      ])
      await fs.move(buildConfig.workspace(target), path.join(workspace, 'usr', 'lib', config.dirname))
      await fs.writeFile(path.join(workspace, 'usr', 'lib', config.dirname, 'bin', config.bin), scripts.bin(config), {mode: 0o755})
      await fs.writeFile(path.join(workspace, 'DEBIAN', 'control'), scripts.control(buildConfig, debArch(arch)))
      await exec(`ln -s "../lib/${config.dirname}/bin/${config.bin}" "${workspace}/usr/bin/${config.bin}"`)
      await exec(`sudo chown -R root "${workspace}"`)
      await exec(`sudo chgrp -R root "${workspace}"`)
      await exec(`dpkg --build "${workspace}" "${path.join(dist, versionedDebBase)}"`)
    }

    const arches = _.uniq(buildConfig.targets
    .filter(t => t.platform === 'linux')
    .map(t => t.arch))
    // eslint-disable-next-line no-await-in-loop
    for (const a of arches) await build(a)

    await exec('apt-ftparchive packages . > Packages', {cwd: dist})
    await exec('gzip -c Packages > Packages.gz', {cwd: dist})
    await exec('bzip2 -k Packages', {cwd: dist})
    await exec('xz -k Packages', {cwd: dist})
    const ftparchive = path.join(buildConfig.tmp, 'apt', 'apt-ftparchive.conf')
    await fs.writeFile(ftparchive, scripts.ftparchive(config))
    await exec(`apt-ftparchive -c "${ftparchive}" release . > Release`, {cwd: dist})
    const gpgKey = config.scopedEnvVar('DEB_KEY')
    if (gpgKey) {
      await exec(`gpg --digest-algo SHA512 --clearsign -u ${gpgKey} -o InRelease Release`, {cwd: dist})
      await exec(`gpg --digest-algo SHA512 -abs -u ${gpgKey} -o Release.gpg Release`, {cwd: dist})
    }
  }
}

