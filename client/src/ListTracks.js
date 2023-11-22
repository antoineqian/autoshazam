import React from 'react'
import shazamIcon from './shazam.svg'; // Adjust the path accordingly
import deleteIcon from './delete.svg'; // Adjust the path accordingly

const ListTracks = ({ tracks, deleteTrack }) => {

    const trackList = tracks ? tracks.map((track, i)=>(
    <div key={i}> 
        <li className="collection-item">
            <span className="title">{track.title} - {track.subtitle}</span>
            <div className="button-container">
              <a href={track.url} target="_blank" rel="noopener noreferrer">
                <img src={shazamIcon} alt="Shazam Icon" className="icon"/>
              </a>
              <a href="#!" onClick={e=>deleteTrack(i)} className="delete-icon">
                <img src={deleteIcon} alt="Delete Icon" className="icon"/>
              </a>
            </div>
        </li>
    </div>)) : null

    return (
        <div className='container'>
            <h3>Results</h3>
            <p>{tracks.length} tracks have been detected </p>
                <ul className="collection">
                    {trackList}
                </ul>
        </div>
    )
}

export default ListTracks;