export default class Layer {
  constructor(data) {
    this.name = data.Name;
    this.classname = data.levelName;
    this.layerid = data.rawName;
    this.map = {
      name: data.mapName
    };
    this.gamemode = data.gamemode;
    this.gamemodeType = data.type;
    this.version = data.layerVersion;
    this.size = data.mapSize;
    this.sizeType = data.mapSizeType;
    this.numberOfCapturePoints = parseInt(data.capturePoints);
    this.lighting = {
      type: data.persistentLightingType,
      classname: data.lightingLevel
    };
    this.factions = data.factions;
    this.commander = data.commander;
    if (Object.keys(data.teamConfigs).length)
      this.tickets = [data.teamConfigs.team1.tickets,
                      data.teamConfigs.team2.tickets];
    else
      // "Automation" maps have no team config, set 0 tickets
      this.tickets = [0, 0];
  }
}
