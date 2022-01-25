import 'source-map-support/register';
import DataDir from '../lib/data/dir';
import { DataSet } from '../lib/data/set';
import { downloadAllData } from '../lib/engine/download';
import { Engine } from "../lib/engine/engine";
import { SlackNotifier } from '../lib/engine/slack-notifier';
import { Hubspot } from '../lib/hubspot';
import { logHubspotResults } from '../lib/hubspot/log-results';
import { Logger } from '../lib/log';
import { engineConfigFromENV, runLoopConfigFromENV } from "../lib/parameters/env-config";
import run from "../lib/util/runner";

const dataDir = DataDir.root.subdir("in");
const dataSet = new DataSet(dataDir);

const logDir = dataDir.subdir('out');
const log = new Logger(logDir);

const runLoopConfig = runLoopConfigFromENV();
const notifier = SlackNotifier.fromENV(log);
notifier?.notifyStarting();

run(log, runLoopConfig, {

  async work() {

    log.info('Main', 'Downloading data');
    const hubspot = Hubspot.live(log);
    await downloadAllData(log, dataSet, hubspot);

    log.info('Main', 'Running engine');
    const data = new DataSet(dataDir).load();
    const engine = new Engine(log, hubspot, engineConfigFromENV());
    engine.run(data);

    log.info('Main', 'Upsyncing changes to HubSpot');
    await hubspot.upsyncChangesToHubspot();

    log.info('Main', 'Writing HubSpot change log file');
    logHubspotResults(hubspot, logDir.file('hubspot-out.txt'));

    log.info('Main', 'Done');
  },

  async failed(errors) {
    notifier?.notifyErrors(runLoopConfig, errors);
  },

});
