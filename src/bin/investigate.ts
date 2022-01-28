import 'source-map-support/register';
import { engineConfigFromENV } from '../lib/config/env';
import { dataManager } from '../lib/data/manager';
import { Engine } from "../lib/engine";
import { printSummary } from "../lib/engine/summary";
import { Hubspot } from '../lib/hubspot';

const engine = new Engine(new Hubspot(), engineConfigFromENV());
const data = dataManager.latestDataSet().load();
engine.run(data);
printSummary(engine);
