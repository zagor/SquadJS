import BasePlugin from './base-plugin.js';

export default class DisbandParty extends BasePlugin {
  static get description() {
    return (
      'The <code>DisbandParty</code> plugin disbands any squad created within the first 3 ' +
      'seconds after a new game has started.'
    );
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {};
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.newGameTime = null;
    this.graceSeconds = 3;

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
    if (Date.now() - this.newGameTime > this.graceSeconds * 1000) return;

    const { player, squadID } = data;
    this.verbose(1, `Disbanding party squad ${squadID} on team ${player.teamID}`);

    try {
      await this.server.rcon.disbandSquad(player.teamID, squadID);
    } catch (err) {
      this.verbose(1, `Failed to disband squad ${squadID}: ${err.message}`);
    }
  }
}
