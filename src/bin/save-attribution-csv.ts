import 'source-map-support/register';
import { engineConfigFromENV } from '../lib/config/env';
import { dataManager } from '../lib/data/manager';
import { DataSet, dataSetConfigFromENV } from '../lib/data/set';
import { Engine } from "../lib/engine";
import { isPresent, sorter } from "../lib/util/helpers";

const engine = new Engine(new DataSet(dataSetConfigFromENV()), engineConfigFromENV());
const { data, logDir } = dataManager.latestDataSet(`inspect-${Date.now()}`);
engine.run(data);

const attributions = (engine
  .mpac.licenses
  .map(l => l.data.attribution)
  .filter(isPresent)
  .sort(sorter(a => [
    Object.keys(a).length,
    a.channel,
    a.referrerDomain,
  ].join(',')))
);

logDir.attributionsLog()!.writeArray(attributions.map(a => ({
  channel: a.channel,
  referrerDomain: a.referrerDomain,
  campaignName: a.campaignName,
  campaignSource: a.campaignSource,
  campaignMedium: a.campaignMedium,
  campaignContent: a.campaignContent,
})));
