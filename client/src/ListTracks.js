import React from 'react'
import shazamIcon from './shazam.svg'; 
import deleteIcon from './delete.svg'; 
import AudioPlayer from './AudioPlayer';

const ListTracks = ({ tracks, deleteTrack }) => {

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
  const trackList = sortedTracks ? sortedTracks.map((track)=>(
  <div key={track.position}> 
      <li className="collection-item">
        <div className='track-info'>
          <span className="title">{track.title} - {track.subtitle}  </span><br></br>
          <span className='subtitle'>  {track.position} min</span>
        </div>
          <div className="button-container">
            <AudioPlayer audioSrc={track.uri}/>
            <a href={track.url} target="_blank" rel="noopener noreferrer" title="Open in Shazam">
              <img src={shazamIcon} alt="Shazam Icon" className="icon"/>
            </a>
            <a href="#!" onClick={e=>deleteTrack(track.position)} className="delete-icon" title="Remove from list">
              <img src={deleteIcon} alt="Delete Icon" className="icon"/>
            </a>
          </div>
      </li>
  </div>)) : null

    return (
        <div className='container'>
            <h3>Results</h3>
            <p>{sortedTracks.length} tracks have been detected </p>
                <ul className="collection">
                    {trackList}
                </ul>
        </div>
    )
}

export default ListTracks;