import BasePlugin from './base-plugin.js';


const TANKS = ['T62', 'T72', 'T90', 'M1A1', 'M1A2', 'M60', 'FV4034', 'LEOPARD', 'ZTZ99'];
const HELIS = ['MI8', 'SA330', 'UH60', 'UH1', 'CH146', 'CH178', 'MRH90', 'Z8', 'RAVEN', 'LOACHSCOUT', 'LOACHCAS']

const claimableVehicles = [
  'BTR80', 'BTR82', 'ASLAV', 'LAV25', 'LAV6', 'LAVIII', 'COYOTE',
  'PARSIII25MM', 'PARSIIIM2', 'PARSIIIMG3', 'PARSIIIMK19',
  'ACV25MM', 'ACVM2', 'ACVMG3',
  'M1126', 'M1128', 'M2A3', 'M7A3',
  'ZBL08', 'ZBD04', 'ZBD05', 'ZTD05',
  'BMP1', 'BMP2', 'BMP3', 'BMD1', 'BMD4',
  'BM21', 'MTLBM6MB',
  'FV107', 'FV432RWS', 'FV510UA', 'FV510', 'SPRUT',
].concat(TANKS).concat(HELIS);

const multiNames = {
  'BTR': ['BTR80', 'BTR82'],
  'LAV': ['ASLAV', 'LAV25', 'LAV6', 'LAVIII'],
  'BMP': ['BMP1', 'BMP2', 'BMP3'],
  'BMD': ['BMD1', 'BMD4'],
  'ACV': ['ACV25MM', 'ACVM2', 'ACVMG3'],
  'PARS': ['PARSIII25MM', 'PARSIIIM2', 'PARSIIIMG3', 'PARSIIIMK19'],
  'MBT': TANKS,
  'TANK': TANKS,
  'HELI': HELIS,
  'LOACH': ['LOACHSCOUT', 'LOACHCAS'],
  'WARRIOR': ['FV510', 'FV510UA'],
  'BRADLEY': ['M2A3', 'M7A3'],
  'ABRAMS': ['M1A1', 'M1A2'],
  'ZBD': ['ZBD04', 'ZBD05'],
};

const vehicleAliases = {
  'BULLDOGRWS': 'FV432RWS',
  'SCIMITAR': 'FV107',
  'LAV3': 'LAVIII',
  'ACVIFV': 'ACV25MM',
  'GRAD': 'BM21',
  'LEO': 'LEOPARD',
  'PARS25MM': 'PARSIII25MM',
  'PARSM2': 'PARSIIIM2',
  'PARSMG3': 'PARSIIIMG3',
  'PARSMK19': 'PARSIIIMK19',
  'ZBL': 'ZBL08',
  'ZTD': 'ZTD05',
  'ZTZ': 'ZTZ99',
  'TYPE04': 'ZBD04',
  'TYPE08': 'ZBL08',
  'TYPE99': 'ZTZ99',
  'MTLBM': 'MTLBM6MB',
  'MTLB30MM': 'MTLBM6MB',
  'MGS': 'M1128',
  'CAS': 'LOACHCAS'
};

/* still unhandled: M1126 CROWS M2 vs M240 */

const allowedLockWithoutClaim = [
  /mortar/i,
  /ub.?32/i,
  /m.?121/i
];

class Vehicle {
  constructor(name, fullName, count, classNames) {
    this.name = name;
    this.fullName = fullName;
    this.count = count;
    this.classNames = classNames
    this.claimedBy = {};
    this.rescueTimer = null;
    this.rescuer = null;
  }
}

class Team {
  constructor(teamIndex) {
    this.index = teamIndex;
    this.squads = {};
  }
}

export default class VehicleClaims extends BasePlugin {
  static get description() {
    return (
      'The <code>VehicleClaims</code> plugin manages vehicle claims.'
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      thief_second_warning_delay: {
        required: false,
        description: 'Time in seconds from first warning to second.',
        default: 10
      },
      thief_kill_delay: {
        required: false,
        description: 'Time in seconds from second warning to kill.',
        default: 10
      },
      locked_squad_min_size: {
        required: false,
        description: 'Minimum allowed size of an infantry squad to be locked. 0 to disable.',
        default: 4
      },
      locked_squad_warn_delay: {
        required: false,
        description: 'Time until warning for locked squad below min size.',
        default: 60
      },
      locked_squad_warn_count: {
        required: false,
        description: 'Number of warnings before disband.',
        default: 2
      },
      locked_squad_disband_delay: {
        required: false,
        description: 'Time until disband after warning for locked squad below min size.',
        default: 30
      },
      rescue_command: {
        required: false,
        description: 'Rescue chat command.',
        default: "rescue"
      },
      rescue_timeout: {
        required: false,
        description: 'Rescue exception timeout, in seconds.',
        default: 300
      },
      command: {
        required: false,
        description: 'Enable/disable admin chat command.',
        default: "claims"
      },
    }
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.enabled = options.enabled;
    this.thiefs = {};
    this.onNewGame = this.onNewGame.bind(this);
    this.onSquadCreated = this.onSquadCreated.bind(this);
    this.onSquadsUpdated = this.onSquadsUpdated.bind(this);
    this.onPlayerPossess = this.onPlayerPossess.bind(this);
    this.onPlayerUnPossess = this.onPlayerUnPossess.bind(this);
    this.onChatCommand = this.onChatCommand.bind(this);
    this.onRescue = this.onRescue.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('SQUAD_CREATED', this.onSquadCreated);
    this.server.on('UPDATED_SQUAD_INFORMATION', this.onSquadsUpdated);
    this.server.on('PLAYER_POSSESS', this.onPlayerPossess);
    this.server.on('PLAYER_UNPOSSESS', this.onPlayerUnPossess);
    this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    this.server.on(`CHAT_COMMAND:${this.options.rescue_command}`, this.onRescue);
    await this.onNewGame();
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
    this.server.removeEventListener('SQUAD_CREATED', this.onSquadCreated);
    this.server.removeEventListener('UPDATED_SQUAD_INFORMATION', this.onSquadsUpdated);
    this.server.removeEventListener('PLAYER_POSSESS', this.onPlayerPossess);
    this.server.removeEventListener('PLAYER_UNPOSSESS', this.onPlayerUnPossess);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.rescue_command}`, this.onRescue);
  }

  isAdmin(playerID) {
    if (playerID in this.server.admins && this.server.admins[playerID].chat) {
      return true;
    }
  }

  async onRescue(info) {
    if (info.chat !== 'ChatSquad') {
      this.server.rcon.warn(info.player.eosID,
                            "The rescue command only works in squad chat.");
      return;
    }

    let foundVic = null;
    if (info.message && this.isAdmin(info.player.steamID)) {
      foundVic = this.getVicFromName(info.message, info.player, false);
      if (!foundVic) {
        this.server.rcon.warn(info.player.eosID, `No vehicle matches "${info.message}".`);
        return;
      }
    }
    else if (info.player.isLeader) {
      const team = this.teams[info.player.teamID - 1];
      const squadID = info.player.squadID.toString();
      for (const vic of Object.values(team.vehicles)) {
        if (Object.keys(vic.claimedBy).includes(squadID)) {
          foundVic = vic;
          break;
        }
      }
    }
    else {
      this.server.rcon.warn(info.player.eosID,
                            "The rescue command can only be used by the squad leader.");
      return;
    }

    if (foundVic) {
      this.server.rcon.warn(
        info.player.eosID,
        'Rescue mode:\n\n' +
          `${foundVic.fullName} can be entered without claim for the next ${this.options.rescue_timeout / 60} minutes.`);
      if (foundVic.rescueTimer)
        clearTimeout(foundVic.rescueTimer);

      foundVic.rescueTimer = setTimeout(this.rescueTimeout,
                                        this.options.rescue_timeout * 1000,
                                        this, foundVic, info.player);
    }
    else {
      this.server.rcon.warn(info.player.eosID, "You don't have a vehicle to rescue.");
      return;
    }
  }

  rescueTimeout(obj, vic, player) {
    vic.rescueTimer = null;
    obj.server.rcon.warn(player.eosID, `Rescue timer expired for ${vic.fullName}.`);
    if (vic.rescuer) {
      obj.server.rcon.warn(vic.rescuer, `Rescue timer expired for ${vic.fullName}.`);
      vic.rescuer = null;
    }
  }

  async onChatCommand(info) {
    if (info.chat !== 'ChatAdmin')
      return;

    const admin = info.player;
    const words = info.message.toLowerCase().split(' ');

    if (words[0] === 'enable' && !this.enabled) {
      this.enabled = true;
      const msg = 'Automatic claim enforcement enabled.';
      this.server.rcon.warn(admin.eosID, msg);
      this.server.rcon.broadcast(msg);
    }
    else if (words[0] === 'disable' && this.enabled) {
      this.enabled = false;
      const msg = 'Automatic claim enforcement disabled.';
      this.server.rcon.warn(admin.eosID, msg);
      this.server.rcon.broadcast(msg);
    }
    else {
      const msg =
            `Claim enforcement is ${this.enabled ? "en" : "dis"}abled.\n`
            + `!${this.options.command} enable\n`
            + `!${this.options.command} disable`;
      this.server.rcon.warn(admin.eosID, msg);
    }
  }

  stripVicName(name) {
    return name.toUpperCase().replaceAll(/[- .]/g, '');
  }

  getVicFromName(name, player, disband) {
    const squadName = name;
    const teamIndex = player.teamID - 1;
    const team = this.teams[teamIndex];
    const strippedSquadName = this.stripVicName(squadName);

    // check exact names
    const sortedNames = Object.keys(team.vehicles).sort(
      function(a, b) { return b.length - a.length}
    );
    for (const vicName of sortedNames) {
      if (strippedSquadName.startsWith(vicName))
        return team.vehicles[vicName];
    }

    // check aliases
    for (const alias in vehicleAliases) {
      if (strippedSquadName.startsWith(alias)) {
        const vicName = vehicleAliases[alias];
        return team.vehicles[vicName];
      }
    }

    // check multinames
    for (const alias in multiNames) {
      if (strippedSquadName.startsWith(alias)) {
        let foundCount = 0;
        let foundName = '';
        for (const vicName of multiNames[alias]) {
          if (vicName in team.vehicles) {
            foundCount++;
            foundName = vicName;
          }
        }
        if (foundCount === 1)
          return team.vehicles[foundName];
        else if (foundCount > 1) {
          this.server.rcon.warn(player.eosID,
                                'Squad name '
                                + squadName
                                + ' claims multiple vehicles.'
                                + '\nBe more specific!');
          if (disband)
            this.server.rcon.disbandSquad(player.teamID, player.squadID);
        }
      }
    }
    return undefined;
  }

  findTeamVehicle(teamIndex, vicName) {
    for (const vic of this.teams[teamIndex].vehicles) {
      if (vic.name === vicName)
        return vic;
    }
    return undefined;
  }

  isClaimableVehicle(vehicleName) {
    for (const v of claimableVehicles) {
      if (vehicleName.startsWith(v))
        return v;
    }
    return undefined;
  }

  setupLayerVehicles() {
    for (const team of this.teams) {
      team.vehicles = {};
      const faction = this.server.currentTeams[team.index].faction;
      for (const vicDict of this.server.currentTeams[team.index].vehicles) {
        const fullName = vicDict.name;
        const stripName = this.stripVicName(fullName);
        const name = this.isClaimableVehicle(stripName);
        if (!name)
          continue;
        team.vehicles[name] = new Vehicle(name, fullName,
                                          vicDict.count,
                                          vicDict.classNames);
        this.verbose(1, `${faction}: ${vicDict.count} x ${fullName}`);
      }
    }
  }

  initLayer() {
    this.layer = this.server.currentLayer;
    this.verbose(1, "Init layer: %s, %s vs %s",
                 this.layer.name,
                 this.server.currentTeams[0].unitID,
                 this.server.currentTeams[1].unitID);
    this.teams = [new Team(0), new Team(1)];
    this.setupLayerVehicles();
  }

  async createInitialSquads() {
    for (const squad of this.server.squads) {
      for (const player of this.server.players) {
        if (player.teamID == squad.teamID
            && player.squadID == squad.squadID
            && player.isLeader) {
          squad.player = player
          await this.onSquadCreated(squad);
          break;
        }
      }
    }
  }

  async onNewGame() {
    if (!this.enabled) return;
    try {
      this.initLayer();
      await this.server.updateSquadList();
      await this.server.updatePlayerList();
      if (this.server.squads.length)
        await this.createInitialSquads();
    }
    catch(err) {
      this.verbose(1, "Caught error " + err);
    }
  }

  pruneSquadClaims(team, squadNum) {
    const teamSquads = this.server.squads.filter((f) => f.teamID == team.index + 1);
    let existingSquads = [];
    for (const squad of teamSquads) {
      existingSquads.push(squad.squadID.toString());
    }
    for (const vic of Object.values(team.vehicles)) {
      for (const s of Object.keys(vic.claimedBy)) {
        if ((s == squadNum) || !existingSquads.includes(s)) {
          this.verbose(2, 'Removing squad %s claim on %s', s, vic.name);
          delete vic.claimedBy[s];
        }
      }
    }
  }

  async onSquadCreated(info) {
    try {
      this._onSquadCreated(info);
    }
    catch (err) {
      this.verbose(1, "Caught error " + err);
    }
  }

  async _onSquadCreated(info) {
    if (!this.enabled) return;
    await this.server.updateSquadList();

    const teamIndex = info.player.teamID - 1;
    const team = this.teams[teamIndex];
    const faction = this.server.currentTeams[teamIndex].faction;

    this.verbose(1, '%s: New squad %d: %s',
                 faction, info.squadID, info.squadName);

    this.pruneSquadClaims(team, info.squadID);
    const squadList = this.server.squads.filter(
      (s) => s.teamID == info.player.teamID && s.squadID == info.player.squadID);
    if (!squadList) {
      this.verbose(1, "*** Error: No squad matching player!");
      return;
    }
    team.squads[info.squadID] = {
      name: info.squadName,
      teamID : info.player.teamID,
      squadID : info.squadID,
      lockTime: (squadList[0].locked == 'True') ?
        new Date().getTime() : undefined
    };

    const vic = this.getVicFromName(info.squadName, info.player, true);
    if (vic) {
      if (Object.keys(vic.claimedBy).length < vic.count) {
        vic.claimedBy[info.squadID] = true;
        this.verbose(1, '%s: Squad %d %s got claim for %s.',
                     faction, info.squadID, info.squadName, vic.name);
        this.server.rcon.warn(info.player.eosID,
                              'You have the claim for ' + vic.fullName + '.');
      }
      else {
        this.server.rcon.warn(info.player.eosID,
                              vic.fullName
                              + ' is already claimed by squad '
                              + Object.keys(vic.claimedBy).join(' & ') + '.');
        this.server.rcon.disbandSquad(info.player.teamID, info.squadID);
      }
    }
    else {
      this.verbose(2, '%s: No vic matching %s', faction, info.squadName);
    }
  }

  findVicByClass(teamID, className) {
    const team = this.teams[teamID - 1]
    for (const vic of Object.values(team.vehicles)) {
      if (vic.classNames.includes(className))
        return vic;
    }
    return undefined;
  }

  findClaim(teamID, squadID) {
    const team = this.teams[teamID - 1]
    for (const vic of Object.values(team.vehicles)) {
      for (const sqid of Object.values(vic.claimedBy)) {
        if (sqid == squadID)
          return vic;
      }
    }
    return undefined;
  }

  killThief(obj, player, vic) {
    delete obj.thiefs[player.eosID];
    obj.server.rcon.switchTeam(player.eosID);
    obj.server.rcon.switchTeam(player.eosID);
    obj.verbose(1, player.name, 'in squad', player.squadID,
                'was killed over', vic.fullName);
  }

  warnThief(obj, player, vic) {
    const delay = obj.options.thief_kill_delay;
    obj.server.rcon.warn(player.eosID,
                         'Claim violation!\n\n' +
                         'Exit the vehicle or be killed.\n' +
                         `You have ${delay} seconds.`);
    obj.verbose(1, player.name, 'in squad', player.squadID,
                'got second warning over', vic.fullName);
    obj.thiefs[player.eosID] = setTimeout(obj.killThief, delay * 1000, obj, player, vic);
  }

  async onPlayerPossess(info) {
    try {
      await this._onPlayerPossess(info);
    }
    catch (err) {
      this.verbose(1, "Caught error " + err);
    }
  }

  async _onPlayerPossess(info) {
    if (!this.enabled) return;
    if (!info.player) {
      this.verbose(1, "*** Error: No player in possess event!", info);
      return;
    }
    const vic = this.findVicByClass(info.player.teamID, info.possessClassname);
    if (vic && !(info.player.squadID in vic.claimedBy)) {
      if (vic.rescueTimer) {
        this.server.rcon.warn(info.player.eosID,
                              'Rescue mode:\n\n' +
                              'This vehicle can temporarily be entered without claim.');
        vic.rescuer = info.player.eosID;
        return;
      }

      let text = '';
      const claimedVic = this.findClaim(info.player.teamID, info.played.squadID);
      if (claimedVic) {
        this.server.rcon.warn(info.player.eosID,
                              'Wrong vehicle!\n\n' +
                              `You have claim for ${claimedVic.fullName}.\n` +
                              `This is a ${vic.fullName}.\n` +
                              'Exit the vehicle immediately.');
      }
      else {
        if (Object.keys(vic.claimedBy).length)
          text = `Squad ${Object.keys(vic.claimedBy).join(' & ')} has the claim for this vehicle.\n`;
        else
          text = 'This vehicle must be claimed in your squad name.\n';

        this.server.rcon.warn(info.player.eosID,
                              'Claim violation!\n\n' +
                              text +
                              'Exit the vehicle immediately.');
      }
      this.verbose(1, info.player.name, 'in squad', info.player.squadID,
                   'got first warning over', vic.fullName);
      this.thiefs[info.player.eosID] =
        setTimeout(this.warnThief,
                   this.options.thief_second_warning_delay * 1000,
                   this, info.player, vic);
    }
  }

  async onPlayerUnPossess(info) {
    try {
      await this._onPlayerUnPossess(info);
    }
    catch (err) {
      this.verbose(1, "Caught error " + err);
    }
  }


  async _onPlayerUnPossess(info) {
    if (!this.enabled) return;
    const vic = this.findVicByClass(info.player.teamID, info.possessClassname);
    if (vic && info.player.eosID in this.thiefs) {
      clearTimeout(this.thiefs[info.player.eosID]);
      delete this.thiefs[info.player.eosID];
    }
  }

  allowedLockName(name) {
    for (const regex of allowedLockWithoutClaim) {
      if (name.match(regex))
        return true;
    }
    return false;
  }

  async onSquadsUpdated() {
    // check for squad lock violations
    if (this.options.locked_squad_min_size == 0)
      return;

    await this.server.rcon.warn('000255cd9d8d491c9c4e5f29ab1e9911',
                                "§3.3 Squad locking violation!\n\n" +
                                `You can't lock infantry squads with less than ${this.options.locked_squad_min_size} people. ` +
                                "Unlock or you will be disbanded.");

    const squadLookup = {};
    for (const s of this.server.squads)
      squadLookup[`${s.teamID}:${s.squadID}`] = s;

    const now = new Date().getTime();
    for (const team of this.teams) {
      for (const squad of Object.values(team.squads)) {
        const s = squadLookup[`${squad.teamID}:${squad.squadID}`];
        if (!s) {
          this.verbose(1, `*** error: No squad found for ${squad.teamID}:${squad.squadID}`);
          delete this.teams[squad.teamID-1].squads[squad.squadID];
          continue;
        }
        if (squad.size >= this.options.locked_squad_min_size ||
            this.findClaim(squad.teamID, squad.squadID) ||
            this.allowedLockName(squad.name))
          continue;

        const faction = this.server.currentTeams[squad.teamID - 1].faction;
        const prefix = `${faction} squad ${squad.squadID} "${squad.name}"`;

        if (s.locked == 'True') {
          if (!squad.lockTime)
            squad.lockTime = new Date().getTime();
          if (squad.warnTime) {
            if ((now - squad.warnTime) > this.options.locked_squad_disband_delay * 1000) {
              await this.server.rcon.warn(s.creatorEOSID,
                                          "You were disbanded for violating squad locking rule §3.3.");
              await this.server.rcon.disbandSquad(squad.teamID, squad.squadID);
              await this.server.rcon.broadcast(`${prefix} was disbanded for violating squad locking rule §3.3.`);
              this.verbose(1, `${prefix} was disbanded for locking.`);
              delete team.squads[squad.squadID];
            }
          }
          else if (now - squad.lockTime > this.options.locked_squad_warn_delay * 1000) {
            squad.warnCount = squad.warnCount ? squad.warnCount + 1 : 1;
            if (squad.warnCount >= this.options.locked_squad_warn_count)
              squad.warnTime = now;
            else
              squad.lockTime = now;
            await this.server.rcon.warn(s.creatorEOSID,
                                        "§3.3 Squad locking violation\n\n" +
                                        `You can't lock infantry squads with less than ${this.options.locked_squad_min_size} people. ` +
                                        "Unlock or be disbanded.");
            this.verbose(1, `${prefix} was warned for locking.`);
          }
          else {
            const secondsLeft = Math.floor(this.options.locked_squad_warn_delay - ((now - squad.lockTime) / 1000));
            this.verbose(2, `${prefix} is locked, but has ${secondsLeft} seconds left.`);
          }
        }
        else {
          if (squad.lockTime)
            this.verbose(2, `${prefix} was locked but is now unlocked.`);
          squad.lockTime = undefined;
          squad.warnTime = undefined;
        }
      }
    }
  }
}
