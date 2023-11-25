
import FileUploadForm from './FileUploadForm';
import { useState } from 'react'
import ListTracks from './ListTracks'


function App() {

  const [tracks, setTracks] = useState([])

  const deleteTrack = i => {
    setTracks(prevTracks => {
      const newTrackList = tracks.filter((track)=>{
        return track.position !== i
      })  
      return newTrackList;
    });
  }

  const addTrack = track => {
    setTracks(prevTracks => {
      const newTrackList = [...prevTracks, track];
      console.log(`Track added. Current length of tracks is ${newTrackList.length}`);
      return newTrackList;
    });
  };
  
  return (
    <div>
      <ListTracks tracks={tracks} deleteTrack={deleteTrack} />
      <FileUploadForm tracks={tracks} addTrack={addTrack}/>
    </div>
  );
}

export default App;
