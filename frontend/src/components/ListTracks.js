import React from 'react'
import shazamIcon from '../images/shazam.svg'; 
import deleteIcon from '../images/delete.svg'; 
import copyIcon from '../images/copy.svg'; 
import copy from 'clipboard-copy';
import toast, { Toaster } from 'react-hot-toast';

import AudioPlayer from './AudioPlayer';

const ListTracks = ({ tracks, deleteTrack, reset}) => {
  console.log('ListTracks', tracks.length)

  function removeDuplicates(data, uniqueKeys) {
    const seen = new Set();
    const result = [];
  
    for (const item of data) {
      // Create a string representation of the values of uniqueKeys for each item
      const keyString = uniqueKeys.map(key => item[key]).join(',');
  
      // Check if the keyString has been seen before
      if (!seen.has(keyString)) {
        seen.add(keyString);
        result.push(item);
      }
    }
    return result;
  }
  
  // Specify the keys that should be considered for uniqueness
  const uniqueKeys = ['title', 'subtitle'];
  const uniqueTracks = removeDuplicates(tracks, uniqueKeys);
  const sortedTracks = [...uniqueTracks].sort((a, b) => a.position - b.position);
  

  const copyToClipBoard = (textToCopy) => {
      copy(textToCopy);
      toast('Successfully copied!')
    };

  if (sortedTracks.length > 0) {
    console.log("sorted", sortedTracks[0])
  }

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