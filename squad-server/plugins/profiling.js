import BasePlugin from './base-plugin.js';

export default class Profiling extends BasePlugin {
  static get description() {
    return (
      "The <code>Profiling</code> plugin creates a CSV profile per match."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnded = this.onRoundEnded.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('ROUND_ENDED', this.onRoundEnded);
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
    this.server.removeEventListener('ROUND_ENDED', this.onRoundEnded);
  }

  async onNewGame(info) {
    if (info.layer.name.toLowerCase().includes('seed')) {
      this.verbose(1, 'Seed layer, not profiling');
      return;
    }
    this.verbose(1, 'Start profiling');
    await this.server.rcon.execute('AdminProfileServerCSV start');
  }

  async onRoundEnded(info) {
    this.verbose(1, 'Stop profiling');
    await this.server.rcon.execute('AdminProfileServerCSV stop');
  }
}
