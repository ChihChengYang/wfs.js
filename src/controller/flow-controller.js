/*
 * Flow Controller
*/
 
import Event from '../events';
import EventHandler from '../event-handler'; 

class FlowController extends EventHandler {

  constructor(wfs) {
    super(wfs,
      Event.MEDIA_ATTACHED,
      Event.BUFFER_CREATED,
      Event.FILE_PARSING_DATA,
      Event.FILE_HEAD_LOADED,
      Event.FILE_DATA_LOADED,
      Event.WEBSOCKET_ATTACHED,
      Event.FRAG_PARSING_DATA,
      Event.FRAG_PARSING_INIT_SEGMENT);
    
    this.fileStart = 0;
    this.fileEnd = 0;
    this.pendingAppending = 0;
    this.mediaType = undefined; 
    channelName:this.channelName;
  }

  destroy() {
     EventHandler.prototype.destroy.call(this);
  }  

  onMediaAttached(data) {      
    if (data.websocketName != undefined){
      var client = new WebSocket( 'ws://' + window.location.host + '/' +  data.websocketName );
      this.wfs.attachWebsocket(client,data.channelName);
    }else{
       console.log('websocketName ERROE!!!');
    }

  }
  
  onBufferCreated(data) {
    this.mediaType = data.mediaType; 
  }

  onFileHeadLoaded(data) { 
  }

  onFileDataLoaded(data) { 
  }

  onFileParsingData(data) {
  }
 
  onWebsocketAttached(data) {
    this.wfs.trigger(Event.BUFFER_APPENDING, {type: 'video', data: data.payload, parent : 'main'}); 
  }
  
  onFragParsingInitSegment(data) {
  	 var tracks = data.tracks, trackName, track;
 
      track = tracks.video;
      if(track) { 
        track.id = data.id;
      }
 
      for (trackName in tracks) {
        track = tracks[trackName];
        var initSegment = track.initSegment;
        if (initSegment) {
          this.pendingAppending++;
          this.wfs.trigger(Event.BUFFER_APPENDING, {type: trackName, data: initSegment, parent : 'main'});
        }
      }
 
  }

  onFragParsingData(data) {
 
      if(data.type === 'video') {
     
      }
       
      [data.data1, data.data2].forEach(buffer => {
        if (buffer) {
          this.pendingAppending++;
          this.wfs.trigger(Event.BUFFER_APPENDING, {type: data.type, data: buffer, parent : 'main'}); 
        }
      });
 
  }

}
export default FlowController;  