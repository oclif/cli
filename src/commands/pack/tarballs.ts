import {Command, Flags} from '@oclif/core'

import * as Tarballs from '../../tarballs'

export default class PackTarballs extends Command {
  static description = `This can be used to create oclif CLIs that use the system node or that come preloaded with a node binary.

Add a pretarball script to your package.json if you need to run any scripts before the tarball is created.`
  static flags = {
    parallel: Flags.boolean({description: 'Build tarballs in parallel.'}),
    'prune-lockfiles': Flags.boolean({description: 'remove lockfiles in the tarball.'}),
    root: Flags.string({char: 'r', default: '.', description: 'Path to oclif CLI root.', required: true}),
    tarball: Flags.string({
      char: 'l',
      description: 'Optionally specify a path to a tarball already generated by NPM.',
      required: false,
    }),
    targets: Flags.string({char: 't', description: 'Comma-separated targets to pack (e.g.: linux-arm,win32-x64).'}),
    xz: Flags.boolean({allowNo: true, description: 'Also build xz.'}),
  }
  static summary = 'Package oclif CLI into tarballs.'

  async run(): Promise<void> {
    const {flags} = await this.parse(PackTarballs)
    const buildConfig = await Tarballs.buildConfig(flags.root, {targets: flags?.targets?.split(','), xz: flags.xz})
    if (buildConfig.targets.length === 0) {
      throw new Error('Please specify one or more valid targets.')
    }

    await Tarballs.build(buildConfig, {
      parallel: flags.parallel,
      ...(process.platform === 'win32' ? {platform: 'win32'} : {}),
      pruneLockfiles: flags['prune-lockfiles'],
      tarball: flags.tarball,
    })
  }
}
