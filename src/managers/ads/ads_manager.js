const LogManager = __src('managers/log')
const CacheManager = __src('managers/cache')
const ProxyManager = __src('managers/proxy')
const commonHelpers = __src('helpers/common')
const TaskQueue = __src('utils/task_queue')

class AdsManager {

  async init(site, options) {
    this._site = site
    this._options = options

    this._cache = CacheManager.for('running_ads')
    this._logger = LogManager.for('site').sub('managers.ads')

    this._queue = new TaskQueue({
      name: 'ads_manager',
      concurrent: true,
      threads: () => ProxyManager.pool('ad').threshold
    })

    await this._loadAds()
  }

  async enqueue(ad) {
    await this._enqueue(ad)
  }

  async waitForFinished() {
    while (this._queue.size > 0) {
      await Promise.delay(1000)
    }
  }

  async _loadAds() {
    const list = await this._cache.all()

    for (const item of list) {
      await this._enqueue(item.value, false)
    }
  }

  async _enqueue(ad, saveCache = true) {
    const adId = commonHelpers.toId(ad)

    if (saveCache) {
      await this._cache.put(adId, ad)
    }

    this._queue.enqueue(() => this._tryRunAd(adId, ad))
  }

  async _tryRunAd(adId, ad) {
    try {
      await this._runAd(adId, ad)

      this._logger.debug({
        ad,
        running: this._queue.threads,
        remain: this._queue.size
      }, 'fetch ad done')
    } catch (error) {
      this._logger.error(error, 'fetch ad error -> retry')
    }
  }

  async _runAd(adId, ad) {
    const runner = await this._options.adRunner({
      ad,
      logger: this._logger
    })

    await runner.run()

    // remove ad from queue
    await this._cache.del(adId)
  }

}

module.exports = new AdsManager()
