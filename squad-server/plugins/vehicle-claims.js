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
  'BM21', 'MTLBZU23', 'MTLBM6MB',
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
  'MTLBZU': 'MTZLBZU23',
  'MGS': 'M1128',
};

/* still unhandled: Technical UB-32, M1126 CROWS M2 vs M240 */
/* todo: stryker vs stryker mgs */

class Vehicle {
  constructor(name, fullName, count, classNames) {
    this.name = name;
    this.fullName = fullName;
    this.count = count;
    this.classNames = classNames
    this.claimedBy = {};
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
    }
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.disband = true;
    this.thiefs = {};
    this.onNewGame = this.onNewGame.bind(this);
    this.onSquadCreated = this.onSquadCreated.bind(this);
    this.onPlayerPossess = this.onPlayerPossess.bind(this);
    this.onPlayerUnPossess = this.onPlayerUnPossess.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('SQUAD_CREATED', this.onSquadCreated);
    this.server.on('PLAYER_POSSESS', this.onPlayerPossess);
    this.server.on('PLAYER_UNPOSSESS', this.onPlayerUnPossess);
    this.initLayer();
    if (this.server.squads.length)
      this.createInitialSquads();
  }

  createInitialSquads() {
    // if SquadJS was started in the middle of a game, read the room
    this.disband = false;
    for (const squad of this.server.squads) {
      for (const player of this.server.players) {
        if (player.teamID === squad.teamID
            && player.squadID === squad.squadID
            && player.isLeader) {
          squad.player = player
          this.onSquadCreated(squad);
        }
      }
    }
    this.disband = true;
  }

  stripVicName(name) {
    return name.toUpperCase().replaceAll(/[- .]/g, '');
  }

  getVicFromSquadName(info, teamIndex) {
    const squadName = info.squadName;
    const team = this.teams[teamIndex];
    const strippedSquadName = this.stripVicName(squadName);

    // check exact names
    for (const vicName in team.vehicles) {
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
          this.server.rcon.warn(info.player.eosID,
                                'Squad name '
                                + squadName
                                + ' claims multiple vehicles.'
                                + '\nBe more specific!');
          if (this.disband)
            this.server.rcon.disbandSquad(info.player.teamID, info.squadID);
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
      for (const vicDict of this.layer.teams[team.index].vehicles) {
        const fullName = vicDict.name;
        const stripName = this.stripVicName(fullName);
        const name = this.isClaimableVehicle(stripName);
        if (!name)
          continue;
        team.vehicles[name] = new Vehicle(name, fullName,
                                          vicDict.count,
                                          vicDict.classnames);
        this.verbose(1,
                     `Team ${team.index}: ${vicDict.count} ${fullName} ${vicDict.classnames}`);
      }
    }
  }

  initLayer() {
    this.layer = this.server.currentLayer
    this.teams = [new Team(0), new Team(1)];
    this.setupLayerVehicles();
  }

  async onNewGame(info) {
    this.verbose(1, 'New game');
    this.initLayer(info.layer)
  }

  async squadRemoved(team, squadID) {
    await this.server.updateSquadList();
    await this.server.updatePlayerList(this);
    for (const vic of Object.values(team.vehicles)) {
      if (Object.keys(vic.claimedBy).includes(squadID)) {
        this.verbose(1, 'Removing squad %s claim on %s', squadID, vic.name);
        delete vic.claimedBy[squadID];
        break;
      }
    }
  }

  async onSquadCreated(info) {
    this.verbose(1, 'New squad %d: %s', info.squadID, info.squadName);

    const teamIndex = info.player.teamID - 1;
    const team = this.teams[teamIndex];

    await this.squadRemoved(team, info.squadID);

    team.squads[info.squadID] = info.squadName;

    const vic = this.getVicFromSquadName(info, teamIndex);
    if (vic) {
      if (Object.keys(vic.claimedBy).length < vic.count) {
        vic.claimedBy[info.squadID] = true;
        this.verbose(1, 'Squad %s got claim for %s.', info.squadID, vic.name);
        this.server.rcon.warn(info.player.eosID,
                              'You have the claim for ' + vic.fullName + '.');
      }
      else {
        this.server.rcon.warn(info.player.eosID,
                              vic.fullName
                              + ' is already claimed by squad '
                              + Object.keys(vic.claimedBy).join(' & ') + '.');
        if (this.disband)
          this.server.rcon.disbandSquad(info.player.teamID, info.squadID);
      }
      // console.log('%o', vic);
    }
    else {
      this.verbose(1, 'No vic matching %s', info.squadName);
    }
  }

  findVicByClass(teamID, className) {
    const team = this.teams[teamID - 1]
    for (const vic of Object.values(team.vehicles)) {
      // console.log('team vic %o', vic);
      if (vic.classNames.includes(className))
        return vic;
    }
    return undefined;
  }

  kickThief(obj, eosID) {
    delete obj.thiefs[eosID];
    obj.server.rcon.switchTeam(eosID);
    obj.server.rcon.switchTeam(eosID);
  }

  warnThief(obj, eosID) {
    const delay = obj.options.thief_kill_delay;
    // console.log('warnThief: %o', eosID);
    obj.server.rcon.warn(eosID,
                         'Rule 4.1 violation!\n\n' +
                         'Exit the vehicle or be killed.\n' +
                         `You have ${delay} seconds.`);
    obj.thiefs[eosID] = setTimeout(obj.kickThief, delay * 1000, obj, eosID);
  }

  async onPlayerPossess(info) {
    const vic = this.findVicByClass(info.player.teamID, info.possessClassname);
    if (vic && !(info.player.squadID in vic.claimedBy)) {
      let text = '';
      if (Object.keys(vic.claimedBy).length)
        text = `Squad ${Object.keys(vic.claimedBy).join(' & ')} has the claim for this vehicle.\n`;
      else
        text = 'This vehicle must be claimed in your squad name.\n';

      this.server.rcon.warn(info.player.eosID,
                            'Rule 4.1 violation!\n\n' +
                            text +
                            'Exit the vehicle immediately.');
      this.thiefs[info.player.eosID] =
        setTimeout(this.warnThief,
                   this.options.thief_second_warning_delay * 1000,
                   this, info.player.eosID);
    }
  }

  async onPlayerUnPossess(info) {
    const vic = this.findVicByClass(info.player.teamID, info.possessClassname);
    if (vic && info.player.eosID in this.thiefs) {
      clearTimeout(this.thiefs[info.player.eosID]);
      delete this.thiefs[info.player.eosID];
    }
  }
}
