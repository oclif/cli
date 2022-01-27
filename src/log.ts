import {CliUx} from '@oclif/core'
import * as qq from 'qqjs'
import * as util from 'util'

export const debug = require('debug')('oclif')
debug.new = (name: string) => require('debug')(`oclif:${name}`)

export function log(format: string, ...args: any[]): void {
  args = args.map((arg: any) => qq.prettifyPaths(arg))
  debug.enabled ? debug(format, ...args) : CliUx.ux.log(`oclif: ${util.format(format, ...args)}`)
}
