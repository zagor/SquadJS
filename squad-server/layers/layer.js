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
    this.objectives = data.objectives || {};
    // Main base locations, keyed by team ID (1 or 2), in Unreal units (cm).
    // Derived from objectives named like "00-Team1Main" / "00-Team2Main".
    this.mainBases = {};
    for (const [key, obj] of Object.entries(this.objectives)) {
      const match = (obj.objectName || key).match(/^\d+-Team(\d)Main$/);
      if (!match) continue;
      this.mainBases[parseInt(match[1])] = {
        x: obj.location_x,
        y: obj.location_y,
        z: obj.location_z
      };
    }
    if (Object.keys(data.teamConfigs).length)
      this.tickets = [data.teamConfigs.team1.tickets,
                      data.teamConfigs.team2.tickets];
    else
      // "Automation" maps have no team config, set 0 tickets
      this.tickets = [0, 0];
  }
}
