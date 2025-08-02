import BasePlugin from './base-plugin.js';

export default class NextLayer extends BasePlugin {
  static get description() {
    return (
      "The <code>NextLayer</code> plugin shows next layer in a friendly way."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      command: {
        required: false,
        description: 'The command word used for showing next layer.',
        default: 'nextlayer'
      },
      broadcast_interval: {
        required: false,
        description: 'The interval for broadcasting next layer, in minutes. 0 to disable.',
        default: 30
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onChatCommand = this.onChatCommand.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnd = this.onRoundEnd.bind(this);
    this.broadcastTimer = undefined;
  }

  async mount() {
    this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('ROUND_END', this.onRoundEnd);
    this.startMidGameTimer();
  }

  async unmount() {
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
  }

  startMidGameTimer() {
    const now = new Date();
    let timer = this.server.matchStartTime;
    while (timer < now) {
      timer = new Date(timer.valueOf() + this.options.broadcast_interval * 60000);
    }
    const nextBroadcast = timer - now;
    this.verbose(1, `First broadcast in ${Math.round(nextBroadcast / 60000)} minutes.`);
    this.broadcastTimer = setTimeout(this.onChatCommand, nextBroadcast);
  }

  startTimer() {
    this.broadcastTimer = setTimeout(this.onChatCommand, this.options.broadcast_interval * 60000);
  }

  async onNewGame() {
    this.startTimer();
  }

  async onRoundEnd() {
    clearInterval(this.broadcastTimer);
  }

  async onChatCommand(info) {
    try {
      const unitRegex = /(\w+)_(\w+)_(\w+)/;
      let units = [];
      for (const team of this.server.nextTeams) {
        const parts = team.unit.unitObjectName.match(unitRegex);
        units.push(`${parts[1]} ${parts[3]}`);
      }
      const text = `Next layer is ${this.server.nextLayer.name}\n${units[0]} vs ${units[1]}`;
      if (!info || info.chat === 'ChatAdmin')
        this.server.rcon.broadcast(text);
      else
        this.server.rcon.warn(info.player.eosID, text);
      if (!info)
        this.startTimer();
    }
    catch (err) {
      this.verbose(1, 'Exception in onChatCommand:', err);
    }
  }
}
