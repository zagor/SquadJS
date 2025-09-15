import { readFile } from 'node:fs/promises';
import Logger from 'core/logger';

import Layer from './layer.js';

class Layers {
  constructor() {
    this.layers = [];
    this.pulled = false;
  }

  async pull(force = false) {
    if (this.pulled && !force) {
      Logger.verbose('Layers', 2, 'Already pulled layers.');
      return;
    }
    if (force) Logger.verbose('Layers', 1, 'Forcing update to layer information...');

    this.layers = [];

    Logger.verbose('Layers', 1, 'Pulling layers...');
    const response = await readFile('layers.json', {encoding: 'utf8'});
    const data = JSON.parse(response);
    for (const layer of data.Maps) {
      this.layers.push(new Layer(layer));
    }
    this.units = data.Units;

    Logger.verbose('Layers', 1, `Pulled ${this.layers.length} layers and ${Object.keys(this.units).length} units.`);

    this.pulled = true;

    return this.layers;
  }

  async getLayerByCondition(condition) {
    await this.pull();
    const matches = this.layers.filter(condition);
    if (matches.length === 1) return matches[0];

    return null;
  }

  convertFactionToUnit(layer, factionName, teamIndex) {
    // From factionName, in format "ADF+Mechanized", return the correct
    // "ADF_XX_Mechanized" for current layer.
    const [fname, ftype] = factionName.split("+");
    const matches = layer.factions.filter((f) =>
      f.factionId === fname &&
        f.availableOnTeams.includes(teamIndex + 1)
    );
    if (matches.length === 1) {
      const faction = matches[0];
      if (!ftype) {
        return faction.defaultUnit;
      }
      else {
        const unitParts = faction.defaultUnit.split('_', 2);
        if (faction.types.includes(ftype))
          return `${unitParts[0]}_${unitParts[1]}_${ftype}`;
        else
          return faction.defaultUnit;
      }
    }
    else if (matches.length === 0) {
      // Data problem workaround: The layer data says this faction is not
      // available on this map, but that is not always true! Use the
      // specified faction and append bits from the first listed faction on
      // the same team.
      const matches = layer.factions.filter(
        (f) => f.availableOnTeams.includes(teamIndex + 1));
      const faction = matches[0];
      const [_, code, defaultUnit] = faction.defaultUnit.match(/^[A-Z]+_([A-Z]+)_(\w+)/);
      let ret;
      if (ftype)
        ret = `${fname}_${code}_${ftype}`;
      else
        ret = `${fname}_${code}_${defaultUnit}`;
      Logger.verbose('Layers', 1, `Faction ${factionName} is not listed for ${layer.name}, returning ${ret}`);
      return ret;
    }
    else
      Logger.verbose('Layers', 1, `Failed to convert faction "${factionName}" on layer ${layer.name}, returned ${matches.length} matches`);
  }

  async getLayerById(layerId, factionOne, factionTwo) {
    const layer = await this.getLayerByCondition((layer) => layer.layerid === layerId);
    if (layer) {
      const factions = [factionOne, factionTwo];
      let teams = [];
      for (const teamIdx of [0, 1]) {
        const faction = factions[teamIdx];
        const unitName = this.convertFactionToUnit(layer, faction, teamIdx);
        const unit = this.units[unitName];
        teams[teamIdx] = {
          faction: unit.factionID,
          name: unit.displayName,
          unitID: unitName,
          unit: unit,
          tickets: layer.tickets[teamIdx],
          commander: layer.commander,
          vehicles: unit.vehicles,
        };
      }
      return [layer, teams]
    }
  }
}

export default new Layers();
