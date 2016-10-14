/*
 * File Loader
*/
import Event from '../events';
import EventHandler from '../event-handler';
 
class FileLoader extends EventHandler {

  constructor(wfs) {
    super(wfs, 
      Event.FRAG_LOADING,
      Event.FILE_HEAD_LOADING,
      Event.FILE_DATA_LOADING);
    this.loaders = {};
  }

  destroy() {
    for (let loaderName in this.loaders) {
      let loader = this.loaders[loaderName];
      if (loader) {
        loader.destroy();
      }
    }
    this.loaders = {};
    EventHandler.prototype.destroy.call(this);
  }

  onFileHeadLoading(data) {  
    let config = this.wfs.config;
    let loader  =  new config.loader(config);
    let loaderContext, loaderConfig, loaderCallbacks;
    loaderContext = { url : config.fmp4FileUrl };
    loaderConfig = {  maxRetry : 0 , retryDelay : 0 };
    loaderCallbacks = { onSuccess : this.fileloadheadsuccess.bind(this) };
    loader.loadHead(loaderContext,loaderConfig,loaderCallbacks);
  }

  fileloadheadsuccess(response ) { 
    this.wfs.trigger(Event.FILE_HEAD_LOADED, { size: response});
  }

  onFileDataLoading(data) {
    let config = this.wfs.config;
    let loader  =  new config.loader(config);
    let loaderContext, loaderConfig, loaderCallbacks;
    loaderContext = { url : config.fmp4FileUrl,   responseType : 'arraybuffer', progressData : false};
    let start = data.fileStart, end = data.fileEnd;
    if (!isNaN(start) && !isNaN(end)) {
      loaderContext.rangeStart = start;
      loaderContext.rangeEnd = end; 
    }
    loaderConfig = { timeout : config.fragLoadingTimeOut, maxRetry : 0 , retryDelay : 0, maxRetryDelay : config.fragLoadingMaxRetryTimeout};
    loaderCallbacks = { onSuccess : this.fileloaddatasuccess.bind(this) };
    loader.load(loaderContext,loaderConfig,loaderCallbacks);
  }
  
  fileloaddatasuccess(response, stats, context) { 
    this.wfs.trigger(Event.FILE_DATA_LOADED, {payload: response.data, stats: stats});
  }
 
  loaderror(response, context) {
    let loader = context.loader;
    if (loader) {
      loader.abort();
    }
    this.loaders[context.type] = undefined;
  } 

  loadtimeout(stats, context) {
    let loader = context.loader;
    if (loader) {
      loader.abort();
    }
    this.loaders[context.type] = undefined;
  }
 
  loadprogress(stats, context, data) {  
    let frag = context.frag;
    frag.loaded = stats.loaded; 
  }

}

export default FileLoader;