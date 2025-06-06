import Logger from 'core/logger';
import BasePlugin from './base-plugin.js';


const TANKS = ['T62', 'T72', 'T90', 'M1A1', 'M1A2', 'M60', 'FV4034', 'LEOPARD', 'ZTZ99'];
const HELIS = ['MI8', 'SA330', 'UH60', 'UH1', 'CH146', 'CH178', 'MRH90', 'Z8', 'RAVEN', 'LOACHSCOUT', 'LOACHCAS']

const claimableVehicles = [
  'BTR80', 'BTR82', 'ASLAV', 'LAV25', 'LAV6', 'LAVIII', 'COYOTE',
  'PARSIII25MM', 'PARSIIIM2', 'PARSIIIMG3', 'PARSIIIMK19',
  'ACV25MM', 'ACVM2', 'ACVMG3',
  'M1126', 'M1128',
  'ZBL08', 'ZBD04', 'ZBD05', 'ZTD05',
  'BMP1', 'BMP2', 'BMP3', 'BMD1', 'BMD4',
  'BM21', 'MTLBZU23', 'MTLBM6MB',
  'FV107', 'FV432RWS', 'FV510UA', 'FV510',
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

class Vehicle {
  constructor(name, fullName, count, className) {
    this.name = name;
    this.fullName = fullName;
    this.count = count;
    this.className = className
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
      todo: {
        required: false,
        description: 'Todo todo todo.',
        default: 42
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
        if (player.teamID == squad.teamID
            && player.squadID == squad.squadID
            && player.isLeader) {
          squad.player = player
          this.onSquadCreated(squad);
        }
      }
    }
    this.disband = true;
  }

  stripVicName(name) {
    return name.toUpperCase().replaceAll(/[\-\ \.]/g, '');
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
        if (foundCount == 1)
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
        const fullName = vicDict['name'];
        const stripName = this.stripVicName(fullName);
        const name = this.isClaimableVehicle(stripName);
        if (!name)
          continue;
        team.vehicles[name] = new Vehicle(name, fullName,
                                          vicDict['count'],
                                          vicDict['classname']);
      }
    }
  }

  initLayer() {
    this.layer = this.server.currentLayer
    this.teams = [new Team(0), new Team(1)];
    this.setupLayerVehicles();
    for (const team of this.teams) {
      for (const [name, vic] of Object.entries(team.vehicles)) {
        this.verbose(1, 'Team %d: %d %s', team.index, vic.count, vic.name);
      }
    }
  }

  async onNewGame(info) {
    this.verbose(1, 'New game');
    this.initLayer(info.layer)
  }

  squadRemoved(team, squadID, squadName) {
    for (const [name, vic] of Object.entries(team.vehicles)) {
      if (squadID in vic.claimedBy) {
        this.verbose(1, 'Removing claim on %s', vic.name);
        delete vic.claimedBy[squadID];
        break;
      }
    }
  }

  async onSquadCreated(info) {
    if (!this.layer)
      this.initLayer()

    this.verbose(1, 'New squad %d: %s', info.squadID, info.squadName);

    const teamIndex = info.player.teamID - 1;
    const team = this.teams[teamIndex];

    if (info.squadID in team.squads) {
      // reusing previously existing squad number
      this.verbose(1, 'Squad %d: %s replacing old squad %d',
                  info.squadID, info.squadName, info.squadID);
      this.squadRemoved(team, info.squadID, team.squads[info.squadID]);
    }
    team.squads[info.squadID] = info.squadName;

    const vic = this.getVicFromSquadName(info, teamIndex);
    if (vic) {
      if (Object.keys(vic.claimedBy).length < vic.count) {
        vic.claimedBy[info.squadID] = true;
        this.server.rcon.warn(info.player.eosID,
                              'You have the claim for ' + vic.fullName);
      }
      else {
        this.server.rcon.warn(info.player.eosID,
                              vic.fullName
                              + ' is already claimed by squad '
                              + Object.keys(vic.claimedBy).join(' & '));
        if (this.disband)
          this.server.rcon.disbandSquad(info.player.teamID, info.squadID);
      }
    }
    else {
      this.verbose(1, 'No vic matching %s', info.squadName);
    }
  }

  findVicByClass(teamID, className) {
    const team = this.teams[teamID - 1]
    for (const [key, vic] of Object.entries(team.vehicles)) {
      //console.log('team vic %o', vic);
      if (vic.className == className)
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
    console.log('warnThief: %o', eosID);
    obj.server.rcon.warn(eosID,
                         'Final warning:'
                         +'\nExit the vehicle or be kicked!');
    obj.thiefs[eosID] = setTimeout(obj.kickThief, 10000, obj, eosID);
  }

  async onPlayerPossess(info) {
    const vic = this.findVicByClass(info.player.teamID, info.possessClassname);

    if (vic && vic.claimedBy && !(info.player.squadId in vic.claimedBy)) {
      this.server.rcon.warn(info.player.eosID,
                            'Squad '
                            + Object.keys(vic.claimedBy).join(' & ')
                            + ' has claim for this vehicle.'
                            + '\nPlease exit the vehicle.');
      this.thiefs[info.player.eosID] =
        setTimeout(this.warnThief, 10000, this, info.player.eosID);
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
