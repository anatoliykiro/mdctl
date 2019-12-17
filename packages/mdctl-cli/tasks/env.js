/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      ndjson = require('ndjson'),
      Stream = require('stream'),
      { add } = require('@medable/mdctl-manifest'),
      { isSet } = require('@medable/mdctl-core-utils/values'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      { Fault } = require('@medable/mdctl-core'),
      exportEnv = require('../lib/env/export'),
      importEnv = require('../lib/env/import'),
      lockUnlock = require('../lib/env/lock_unlock'),
      Task = require('../lib/task')

class Env extends Task {

  constructor() {
    super({
      format: {
        default: 'json',
        type: 'string'
      },
      manifest: {
        default: '',
        type: 'string'
      },
      gzip: {
        type: 'boolean',
        default: false
      },
      clear: {
        type: 'boolean',
        default: false
      },
      preferUrls: {
        type: 'boolean',
        default: false
      },
      debug: {
        type: 'boolean',
        default: false
      },
      dryRun: {
        type: 'boolean',
        default: false
      },
      triggers: {
        type: 'boolean',
        default: true
      },
      backup: {
        type: 'boolean',
        default: true
      },
      production: {
        type: 'boolean',
        default: false
      }
    })
    this.optionKeys = ['manifest', 'format', 'gzip', 'clear', 'dir', 'debug', 'dryRun', 'backup', 'triggers', 'preferUrls', 'production']
  }

  async run(cli) {

    const arg1 = this.args('1'),
          handler = `env@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Env.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)
  }

  async 'env@export'(cli) {
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys)
    try {
      await exportEnv({ client, ...params })
      console.log('Export finished...!')
    } catch (e) {
      throw e
    }
  }

  async 'env@import'(cli) {

    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys),
          format = this.args('format')

    function outputResult(data) {
      const formatted = Task.formatOutput(data, format),
            isError = data && data.object === 'fault'

      if (isError) {
        console.error(formatted)
      } else {
        console.log(formatted)
      }
    }

    return new Promise(async(resolve, reject) => {
      let stream
      try {
        stream = await importEnv({ client, ...params, stream: ndjson.parse() })
      } catch (e) {
        if (e instanceof Stream) {
          stream = e
        } else {
          return reject(e)
        }
      }

      stream.on('data', (data) => {
        if (data instanceof Buffer) {
          /* eslint-disable no-param-reassign */
          try {
            data = JSON.parse(data.toString())
          } catch (e) {
            // do nothing
          }
        }
        if (pathTo(data, 'object') === 'fault') {
          reject(data)
        } else if (pathTo(data, 'object') === 'result') {
          outputResult(data.data)
        } else {
          outputResult(data)
        }
      })

      stream.once('error', (err) => {
        reject(err)
      })

      stream.on('end', () => {
        resolve(true)
      })

    }).then(() => {
      console.log('Import finished...!')
    })

  }

  async 'env@add'(cli) {
    const params = await cli.getArguments(this.optionKeys),
          options = Object.assign(params, {
            object: this.args('2'),
            type: this.args('3'),
            name: this.args('4')
          })
    await add(options)
    console.log('Resource added...!')
  }

  async 'env@lock'(cli) {
    // eslint-disable-next-line max-len
    const params = Object.assign(await cli.getAuthOptions() || {}, await cli.getArguments(this.optionKeys)),
          client = await cli.getApiClient(),
          { endpoint: defaultEndpoint, env: defaultEnv } = client.credentials.environment,
          // eslint-disable-next-line max-len
          { endpoint, env, dir } = Object.assign({ endpoint: defaultEndpoint, env: defaultEnv }, params)
    await lockUnlock.lock(dir || process.cwd(), endpoint, env)
  }

  async 'env@unlock'(cli) {
    const params = await cli.getArguments(this.optionKeys),
          { dir } = params
    await lockUnlock.unlock(dir || process.cwd())
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'environment tools'
  }

  static help() {

    return `    
      Environment environment tools.
      
      Usage: 
        
        mdctl env [command] [options]
            
      Arguments:               
        
        command                      
          export - export from an endpoint environment        
          import - import to an endpoint environment   
          add object [type] name - add a new resource
          lock - will lock workspace to an specific endpoint/env location
          unlock - will remove lock for an specific endpoint/env location    
                  
        options     
          --endpoint sets the endpoint. eg. api.dev.medable.com     
          --env sets the environment. eg. example                              
          --manifest - defaults to $cwd/manifest.json
          --format - export format (json, yaml) defaults to json
          --debug - log messages and progress to stdout
          --clear - export will clear output dir before export default true
          --preferUrls - set to true to force the server to send urls instead of base64 encoded chunks 
          --silent - skip documents with missing export keys instead of failing
          --backup - (Import only) default: true. set to false to disable the deployment backup/rollback mechanism
          --production - (Import only) default: false. To help prevent unintentional imports, the production flag must be set in production and only in production environments.
          --triggers - (Import only) default: true. set to false to disable script triggers for imported resources
          --dry-run - (Import only) will skip calling api
                                  
    `
  }

}

module.exports = Env
