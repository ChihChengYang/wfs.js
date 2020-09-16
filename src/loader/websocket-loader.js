/*
 * Websocket Loader
*/

import Event from '../events';
import EventHandler from '../event-handler';
import SlicesReader from '../utils/h264-nal-slicesreader.js';

class WebsocketLoader extends EventHandler {

  constructor(wfs) {
    super(wfs, 
    Event.WEBSOCKET_ATTACHING,
    Event.WEBSOCKET_DATA_UPLOADING,
    Event.WEBSOCKET_MESSAGE_SENDING)   
    this.buf = null;
    this.slicesReader = new SlicesReader(wfs);
    this.mediaType = undefined; 
    this.channelName = undefined; 
  }
 
  destroy() { 
	!!this.client && this.client.close();
	this.slicesReader.destroy();
    EventHandler.prototype.destroy.call(this);
  }

  onWebsocketAttaching(data) {
  	this.mediaType = data.mediaType; 
  	this.channelName = data.channelName;  
    if( data.websocket instanceof WebSocket ) {
      this.client = data.websocket;
      this.client.onopen = this.initSocketClient.bind(this);   
      this.client.onclose = function(e) {
          console.log('Websocket Disconnected!');
      }; 
    }    
  }

  initSocketClient(client){
    this.client.binaryType = 'arraybuffer';
    this.client.onmessage = this.receiveSocketMessage.bind(this);
    this.wfs.trigger(Event.WEBSOCKET_MESSAGE_SENDING, {commandType: "open", channelName:this.channelName, commandValue:"NA" });
    console.log('Websocket Open!'); 
  }
 
  receiveSocketMessage( event ){
    if(document['hidden']) return;
    this.buf = new Uint8Array(event.data);
    var copy = new Uint8Array(this.buf);   
    
    if (this.mediaType ==='FMp4'){
      this.wfs.trigger(Event.WEBSOCKET_ATTACHED, {payload: copy });
    } 
    if (this.mediaType === 'H264Raw'){
      this.wfs.trigger(Event.H264_DATA_PARSING, {data: copy });
    }   
  }

  onWebsocketDataUploading( event ){
    this.client.send( event.data );
  }
  
  onWebsocketMessageSending( event ){  
    this.client.send( JSON.stringify({ t: event.commandType, c:event.channelName, v: event.commandValue  }) );
  }

}

export default WebsocketLoader;  
