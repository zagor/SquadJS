import BasePlugin from './base-plugin.js';

export default class DisbandParty extends BasePlugin {
  static get description() {
    return (
      'The <code>DisbandParty</code> plugin disbands any squad created within the first ' +
      'few seconds (<code>graceSeconds</code>) after a new game has started.'
    );
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      graceSeconds: {
        required: false,
        description:
          'Squads created within this many seconds after a new game starts are disbanded.',
        default: 5
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.newGameTime = null;

    this.onNewGame = this.onNewGame.bind(this);
    this.onSquadCreated = this.onSquadCreated.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('SQUAD_CREATED', this.onSquadCreated);
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
    this.server.removeEventListener('SQUAD_CREATED', this.onSquadCreated);
  }

  onNewGame() {
    this.newGameTime = Date.now();
  }

  async onSquadCreated(data) {
    if (this.newGameTime === null) return;
    if (Date.now() - this.newGameTime > this.options.graceSeconds * 1000) return;
    if (!data.squadName.match(/^Squad \d+$/)) return;
    if (data.player?.partyID === null || data.player?.partyID === undefined) return;

    this.verbose(1, `Disbanding party squad ${data.squadID} on team ${data.player.teamID}`);

    try {
      await this.server.rcon.disbandSquad(data.player.teamID, data.squadID);
    } catch (err) {
      this.verbose(1, `Failed to disband squad ${data.squadID}: ${err.message}`);
    }
  }
}
