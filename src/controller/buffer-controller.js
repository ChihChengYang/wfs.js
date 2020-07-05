/*
 * Buffer Controller
*/

import Event from '../events';
import EventHandler from '../event-handler';
 
class BufferController extends EventHandler {

  constructor(wfs) {
    super(wfs,
      Event.MEDIA_ATTACHING,
      Event.BUFFER_APPENDING,
      Event.BUFFER_RESET
    );
    
    this.mediaSource = null;
    this.media = null;
    this.pendingTracks = {};
    this.sourceBuffer = {};
    this.segments = [];
 
    this.appended = 0;
    this._msDuration = null;

    // Source Buffer listeners
    this.onsbue = this.onSBUpdateEnd.bind(this);

    this.browserType = 0;
    if (navigator.userAgent.toLowerCase().indexOf('firefox') !== -1){
      this.browserType = 1;
    }
    this.mediaType = 'H264Raw';

    this.websocketName = undefined; 
    this.channelName = undefined;
  }

  destroy() {
    EventHandler.prototype.destroy.call(this);
  }
 
  onMediaAttaching(data) {
    let media = this.media = data.media;
    this.mediaType = data.mediaType;
    this.websocketName = data.websocketName;
    this.channelName = data.channelName;
    if (media) {
      // setup the media source
      var ms = this.mediaSource = new MediaSource();
      //Media Source listeners
      this.onmso = this.onMediaSourceOpen.bind(this);
      this.onmse = this.onMediaSourceEnded.bind(this);
      this.onmsc = this.onMediaSourceClose.bind(this);
      ms.addEventListener('sourceopen', this.onmso);
      ms.addEventListener('sourceended', this.onmse);
      ms.addEventListener('sourceclose', this.onmsc);
      // link video and media Source
      media.src = URL.createObjectURL(ms);
    }
  }

  onMediaDetaching() {
 
  }
   
  onBufferAppending(data) { 
    if (!this.segments) {
      this.segments = [ data ];
    } else {
      this.segments.push(data); 
    }
    this.doAppending(); 
  }
  
  onMediaSourceClose() {
    console.log('media source closed');
  }

  onMediaSourceEnded() {
    console.log('media source ended');
  }

  onSBUpdateEnd(event) { 
    // Firefox
    if (this.browserType === 1){
      this.mediaSource.endOfStream();
      this.media.play();  
    }
 
    this.appending = false;
    this.doAppending();
    this.updateMediaElementDuration();
 
  }
 
  updateMediaElementDuration() {
  
  }

  onMediaSourceOpen() { 
    let mediaSource = this.mediaSource;
    if (mediaSource) {
      // once received, don't listen anymore to sourceopen event
      mediaSource.removeEventListener('sourceopen', this.onmso);
    }

    if (this.mediaType === 'FMp4'){ 
      this.checkPendingTracks();
    }

    this.wfs.trigger(Event.MEDIA_ATTACHED, {media:this.media, channelName:this.channelName, mediaType: this.mediaType, websocketName:this.websocketName});
  }

  checkPendingTracks() {  
    this.createSourceBuffers({ tracks : 'video' , mimeType:'' } );
    this.pendingTracks = {};  
  }

  onBufferReset(data) { 
    if (this.mediaType === 'H264Raw'){ 
      this.createSourceBuffers({ tracks : 'video' , mimeType: data.mimeType } );
    }
  }
 
  createSourceBuffers(tracks) {
    var sourceBuffer = this.sourceBuffer,mediaSource = this.mediaSource;
    let mimeType;
    if (tracks.mimeType === ''){
      mimeType = 'video/mp4;codecs=avc1.420028'; // avc1.42c01f avc1.42801e avc1.640028 avc1.420028
    }else{
      mimeType = 'video/mp4;codecs=' + tracks.mimeType;
    }
 
    try {
      let sb = sourceBuffer['video'] = mediaSource.addSourceBuffer(mimeType);
      sb.addEventListener('updateend', this.onsbue);
      tracks.buffer = sb;
    } catch(err) {

    }
    this.wfs.trigger(Event.BUFFER_CREATED, { tracks : tracks } );
    this.media.play();    
  }

  doAppending() {
   
    var wfs = this.wfs, sourceBuffer = this.sourceBuffer, segments = this.segments;
    if (Object.keys(sourceBuffer).length) {
       
      if (this.media.error) {
        this.segments = [];
        console.log('trying to append although a media error occured, flush segment and abort');
        return;
      }
      if (this.appending) { 
        return;
      }
         
      if (segments && segments.length) { 
        var segment = segments.shift();
        try {
          if(sourceBuffer[segment.type]) { 
            this.parent = segment.parent;
            sourceBuffer[segment.type].appendBuffer(segment.data);
            this.appendError = 0;
            this.appended++;
            this.appending = true;
          } else {
  
          }
        } catch(err) {
          // in case any error occured while appending, put back segment in segments table 
          segments.unshift(segment);
          var event = {type: ErrorTypes.MEDIA_ERROR};
          if(err.code !== 22) {
            if (this.appendError) {
              this.appendError++;
            } else {
              this.appendError = 1;
            }
            event.details = ErrorDetails.BUFFER_APPEND_ERROR;
            event.frag = this.fragCurrent;   
            if (this.appendError > wfs.config.appendErrorMaxRetry) { 
              segments = [];
              event.fatal = true;    
              return;
            } else {
              event.fatal = false; 
            }
          } else { 
            this.segments = [];
            event.details = ErrorDetails.BUFFER_FULL_ERROR; 
            return;
          } 
        }
        
      }
    }
  }
 
}

export default BufferController;
