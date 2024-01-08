import React from 'react'
import shazamIcon from './shazam.svg'; 
import deleteIcon from './delete.svg'; 
import copyIcon from './copy.svg'; 
import copy from 'clipboard-copy';
import toast, { Toaster } from 'react-hot-toast';

import AudioPlayer from './AudioPlayer';

const ListTracks = ({ sortedTracks, deleteTrack, reset}) => {
  
  const copyToClipBoard = (textToCopy) => {
      copy(textToCopy);
      toast('Successfully copied!')
    };


  const trackList = sortedTracks ? sortedTracks.map((track)=>(
  <div key={track.position + "_" + track.fileIndex}> 
      <li className="collection-item">
        <div className='track-info'>
          <span className="title">{track.subtitle} - {track.title}  </span><br></br>
          <span className='subtitle'>  {track.position} min</span>
        </div>
          <div className="button-container">
            <AudioPlayer audioSrc={track.uri}/>
            <a href={track.url} target="_blank" rel="noopener noreferrer" title="Open in Shazam">
              <img src={shazamIcon} alt="Shazam Icon" className="icon"/>
            </a>
            <a href="#!" onClick={e=>deleteTrack(track.position, track.fileIndex)} className="delete-icon" title="Remove from list">
              <img src={deleteIcon} alt="Delete Icon" className="icon"/>
            </a>
            <a href="#!" onClick={e=>copyToClipBoard(`${track.subtitle} ${track.title}`)} title="Copy track info to clipboard">
              <img src={copyIcon} alt="Copy Icon" className="icon"/>
            </a>
            <Toaster />
          </div>
      </li>
  </div>)) : null

    return (
      // sortedTracks.length > 0 ?(
        <div className='container'>
            <h3>Results</h3>
            <p>{sortedTracks.length} tracks have been detected </p>
              <button className="btn reset-btn" onClick={e=>reset()}>
              Reset </button>
                <ul className="collection">
                    {trackList}
                </ul>
        </div>
        // ) : <div></div>
    )
}

export default ListTracks;