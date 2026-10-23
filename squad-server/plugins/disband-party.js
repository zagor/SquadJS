import BasePlugin from './base-plugin.js';

export default class DisbandParty extends BasePlugin {
  static get description() {
    return (
      'The <code>DisbandParty</code> plugin disbands squads that the game autogenerates for ' +
      'players, such as party squads on new game or when a player joins.'
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
    this.onSquadCreated = this.onSquadCreated.bind(this);
  }

  async mount() {
    this.server.on('AUTO_SQUAD_CREATED', this.onSquadCreated);
  }

  async unmount() {
    this.server.removeListener('AUTO_SQUAD_CREATED', this.onSquadCreated);
  }

  async onSquadCreated(data) {
    if (!data.player) return;

    this.verbose(1, `Disbanding party squad ${data.squadID} on team ${data.player.teamID}`);

    try {
      await this.server.rcon.disbandSquad(data.player.teamID, data.squadID);
    } catch (err) {
      this.verbose(1, `Failed to disband squad ${data.squadID}: ${err.message}`);
    }
  }
}
