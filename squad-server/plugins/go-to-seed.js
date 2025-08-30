import BasePlugin from './base-plugin.js';

export default class GoToSeed extends BasePlugin {
  static get description() {
    return (
      "The <code>GoToSeed</code> plugin sets a seed layer when player count drops below a limit."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      player_limit: {
        required: false,
        description: 'Number of players under which seed is started.',
        default: 10
      },
      seed_layer: {
        required: false,
        description: 'Name of seed layer.',
        default: 'Sumari_Seed_v1 USA RGF'
      },
      check_interval: {
        required: false,
        description: 'Interval to run check, in seconds.',
        default: 120
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onTimerExpiry = this.onTimerExpiry.bind(this);
    this.timer = setInterval(this.onTimerExpiry, this.options.check_interval * 1000);
  }

  async mount() {
  }

  async unmount() {
  }

  async onTimerExpiry() {
    if (this.server.currentLayer.name.toLowerCase().includes('seed'))
      return;

    const players = this.server.players.length;
    if (players > 0 && players < this.options.player_limit) {
      this.verbose(1, `Only ${this.server.players.length} players, going to seed.`);
      await this.server.rcon.execute(`AdminChangeLayer ${this.options.seed_layer}`);
    }
  }
}
