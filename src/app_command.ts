import {flags} from '@anycli/command'

import Base from './command_base'

export default abstract class AppCommand extends Base {
  static flags = {
    defaults: flags.boolean({description: 'use defaults for every setting'}),
    options: flags.string({description: '(typescript|semantic-release|mocha)'}),
    force: flags.boolean({description: 'overwrite existing files'}),
  }
  static args = [
    {name: 'path', required: false}
  ]

  abstract type: string

  async run() {
    const {flags, args} = this.parse(AppCommand)
    const options = flags.options ? flags.options.split(',') : []

    await super.generate('app', {
      type: this.type,
      path: args.path,
      options,
      defaults: flags.defaults,
      force: flags.force
    })
  }
}
