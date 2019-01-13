/**

*/
import Event from '../events';
import ExpGolomb from './exp-golomb';
import EventHandler from '../event-handler';
import MP4Remuxer from '../remux/mp4-remuxer';

class h264Demuxer extends EventHandler {
  
  constructor(wfs, config=null) {
    super(wfs, 
      Event.H264_DATA_PARSED);

    this.config = this.wfs.config || config;
    this.wfs = wfs;
    this.id = 'main';
 
    this.remuxer = new MP4Remuxer(this.wfs, this.id , this.config);   
    this.contiguous = true; 
    this.timeOffset = 1;
    this.sn = 0;
    this.TIMESCALE = 90000; 
    this.timestamp = 0;
    this.scaleFactor = this.TIMESCALE /1000;
    this.H264_TIMEBASE = 3000;
    this._avcTrack = {container : 'video/mp2t', type: 'video', id :1, sequenceNumber: 0,
     samples : [], len : 0, nbNalu : 0, dropped : 0, count : 0 };
    this.browserType = 0;
    if (navigator.userAgent.toLowerCase().indexOf('firefox') !== -1){
      this.browserType = 1;
    }
  }

  destroy() {
    EventHandler.prototype.destroy.call(this);
  }
 
  getTimestampM() {
    this.timestamp += this.H264_TIMEBASE;
    return  this.timestamp;
  }

  onH264DataParsed(event){ 
    this._parseAVCTrack( event.data); 
    if (this.browserType === 1 || this._avcTrack.samples.length >= 20){ // Firefox
      this.remuxer.pushVideo(0, this.sn, this._avcTrack, this.timeOffset, this.contiguous);
      this.sn += 1;
    }
  } 

  _parseAVCTrack(array) {
    var track = this._avcTrack,
      samples = track.samples,
      units = this._parseAVCNALu(array),
      units2 = [],
      debug = false,
      key = false,
      length = 0,
      expGolombDecoder,
      avcSample,
      push,
      i;    
    var debugString = '';
    var pushAccesUnit = function() {
      if (units2.length) { 
        if (!this.config.forceKeyFrameOnDiscontinuity ||
            key === true ||
            (track.sps && (samples.length || this.contiguous))) { 
          var tss = this.getTimestampM();
          avcSample = {units: { units : units2, length : length}, pts: tss, dts: tss, key: key};
          samples.push(avcSample);
          track.len += length;
          track.nbNalu += units2.length;
        } else { 
          track.dropped++;
        }
        units2 = [];
        length = 0;
      }
    }.bind(this);

    units.forEach(unit => {
      switch(unit.type) {
        //NDR
         case 1:
           push = true;
           if(debug) {
            debugString += 'NDR ';
           }
           break;
        //IDR
        case 5:
          push = true;
          if(debug) {
            debugString += 'IDR ';
          } 
          key = true;
          break;
        //SEI
        case 6:
          unit.data = this.discardEPB(unit.data);
          expGolombDecoder = new ExpGolomb(unit.data);
          // skip frameType
          expGolombDecoder.readUByte();
          break;
        //SPS
        case 7:
          push = false;
          if(debug) {
            debugString += 'SPS ';
          }
          if(!track.sps) {
            expGolombDecoder = new ExpGolomb(unit.data);
            var config = expGolombDecoder.readSPS();
            track.width = config.width;
            track.height = config.height;
            track.sps = [unit.data];
            track.duration = 0; 
            var codecarray = unit.data.subarray(1, 4);
            var codecstring = 'avc1.';
            for (i = 0; i < 3; i++) {
              var h = codecarray[i].toString(16);
              if (h.length < 2) {
                h = '0' + h;
              }
              codecstring += h;
            }
            track.codec = codecstring;         
            this.wfs.trigger(Event.BUFFER_RESET, {  mimeType:  track.codec } ); 
            push = true;
          }
          break;
        //PPS
        case 8:
          push = false;
          if(debug) {
            debugString += 'PPS ';
          }
          if (!track.pps) {
            track.pps = [unit.data];
             push = true;
          }
          break; 
        case 9:
          push = false;
          if(debug) {
            debugString += 'AUD ';
          }
          pushAccesUnit();
          break;      
        default:
          push = false;
          debugString += 'unknown NAL ' + unit.type + ' ';
          break;
      }
    
      if(push) {
        units2.push(unit);
        length+=unit.data.byteLength; 
      }
    
    });
    
    if(debug || debugString.length) {
      logger.log(debugString);
    }
    
    pushAccesUnit();
   
  }
  
  _parseAVCNALu(array) {
    var i = 0, len = array.byteLength, value, overflow, state = 0; //state = this.avcNaluState;
    var units = [], unit, unitType, lastUnitStart, lastUnitType; 
    while (i < len) {
      value = array[i++];
      // finding 3 or 4-byte start codes (00 00 01 OR 00 00 00 01)
      switch (state) {
        case 0:
          if (value === 0) {
            state = 1;
          }
          break;
        case 1:
          if( value === 0) {
            state = 2;
          } else {
            state = 0;
          }
          break;
        case 2:
        case 3:
          if( value === 0) {
            state = 3;
          } else if (value === 1 && i < len) {
            unitType = array[i] & 0x1f;
            if (lastUnitStart) {
              unit = {data: array.subarray(lastUnitStart, i - state - 1), type: lastUnitType}; 
              units.push(unit); 
            } else { 
            }
            lastUnitStart = i;
            lastUnitType = unitType;
            state = 0;
          } else {
            state = 0;
          }
          break;
        default:
          break;
      }
    }

    if (lastUnitStart) { 
      unit = {data: array.subarray(lastUnitStart, len), type: lastUnitType, state : state};
      units.push(unit); 
    }

    return units;
  }

  /**
   * remove Emulation Prevention bytes from a RBSP
   */
  discardEPB(data) {
    var length = data.byteLength,
        EPBPositions = [],
        i = 1,
        newLength, newData;
    // Find all `Emulation Prevention Bytes`
    while (i < length - 2) {
      if (data[i] === 0 &&
          data[i + 1] === 0 &&
          data[i + 2] === 0x03) {
        EPBPositions.push(i + 2);
        i += 2;
      } else {
        i++;
      }
    }
    // If no Emulation Prevention Bytes were found just return the original
    // array
    if (EPBPositions.length === 0) {
      return data;
    }
    // Create a new array to hold the NAL unit data
    newLength = length - EPBPositions.length;
    newData = new Uint8Array(newLength);
    var sourceIndex = 0;

    for (i = 0; i < newLength; sourceIndex++, i++) {
      if (sourceIndex === EPBPositions[0]) {
        // Skip this byte
        sourceIndex++;
        // Remove this position index
        EPBPositions.shift();
      }
      newData[i] = data[sourceIndex];
    }
    return newData;
  }

 
}

export default h264Demuxer;

