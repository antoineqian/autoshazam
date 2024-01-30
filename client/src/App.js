
import FileUploadForm from './FileUploadForm';
import { useState } from 'react'
import ListTracks from './ListTracks'

function App() {

  const [tracks, setTracks] = useState([])

  const deleteTrack = (pos, index) => {
    setTracks(prevTracks => {
      const newTrackList = tracks.filter((track)=>{
        return !(track.position == pos && track.fileIndex == index)
      })  
      return newTrackList;
    });
  }

  const addTrack = (track) => {
    setTracks(prevTracks => {
      const newTrackList = [...prevTracks, JSON.parse(track)];
      console.log(newTrackList)
      return newTrackList;
    });
  };

  const reset = () => {
    setTracks(prevTracks => {
      const newTrackList = [];
      return newTrackList;
    });
  };
  


  return (
    <div>
      <FileUploadForm addTrack={addTrack}/>
      <ListTracks tracks={tracks} deleteTrack={deleteTrack} reset={reset}/>
    </div>
  );
}

export default App;
