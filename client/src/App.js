
import FileUploadForm from './FileUploadForm';
import { useState } from 'react'
import ListTracks from './ListTracks'


function App() {

  const [tracks, setTracks] = useState([])

  const deleteTrack = i => {
    const newNoteList = tracks.filter((note, index)=>{
      return index !== i
    })
    setTracks(newNoteList)    
  }
  return (
    <div>
      <ListTracks tracks={tracks} deleteTrack={deleteTrack} />
      <FileUploadForm setTracks={setTracks}/>
    </div>
  );
}

export default App;
