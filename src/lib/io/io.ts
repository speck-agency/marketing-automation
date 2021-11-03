import { Remote } from "../io/interfaces.js";
import { cli } from "../parameters/cli.js";
import { LiveTldListerService } from './live/domains.js';
import { LiveEmailProviderListerService } from './live/email-providers.js';
import LiveHubspotService from './live/hubspot.js';
import { LiveMarketplaceService } from './live/marketplace.js';
import { MemoryTldListerService } from './memory/domains.js';
import { MemoryEmailProviderListerService } from './memory/email-providers.js';
import { MemoryHubspot } from './memory/hubspot.js';
import { MemoryMarketplace } from './memory/marketplace.js';

export class IO {

  static fromCli() {
    return new IO({
      in: cli.getChoiceOrFail('--downloader', ['local', 'remote']),
      out: cli.getChoiceOrFail('--uploader', ['local', 'remote']),
    });
  }

  public in: Remote;
  public out: Remote;

  constructor(opts: { in: 'local' | 'remote', out: 'local' | 'remote' }) {
    if (opts.in === 'local' && opts.out === 'local') {
      this.in = this.out = new MemoryRemote();
    }
    else if (opts.in === 'remote' && opts.out === 'remote') {
      this.in = this.out = new LiveRemote();
    }
    else {
      this.in = remoteFor(opts.in);
      this.out = remoteFor(opts.out);
    }
  }

}

function remoteFor(opt: 'local' | 'remote'): Remote {
  switch (opt) {
    case 'local': return new MemoryRemote();
    case 'remote': return new LiveRemote();
  }
}

class MemoryRemote implements Remote {
  marketplace = new MemoryMarketplace();
  tldLister = new MemoryTldListerService();
  emailProviderLister = new MemoryEmailProviderListerService();
  hubspot = new MemoryHubspot();
}

class LiveRemote implements Remote {
  hubspot = new LiveHubspotService();
  marketplace = new LiveMarketplaceService();
  emailProviderLister = new LiveEmailProviderListerService();
  tldLister = new LiveTldListerService();
}
