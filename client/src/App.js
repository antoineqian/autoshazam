
import FileUploadForm from './FileUploadForm';
import { useState } from 'react'
import ListTracks from './ListTracks'
import Socket from './Socket'


function App() {

  const [tracks, setTracks] = useState([])
  const [connection, setConnection] = useState(null)
  const [url, setUrl] = useState('')

  const deleteTrack = (pos, index) => {
    setTracks(prevTracks => {
      const newTrackList = tracks.filter((track)=>{
        return !(track.position == pos && track.fileIndex == index)
      })  
      return newTrackList;
    });
  }

  const addTrack = track => {
    setTracks(prevTracks => {
      const newTrackList = [...prevTracks, track];
      return newTrackList;
    });
  };

  const reset = () => {
    setTracks(prevTracks => {
      const newTrackList = [];
      return newTrackList;
    });
  };
  
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
  

  function makeConnection(){
    // ifconnection != null
  }
  return (
    <div>
      <FileUploadForm setTracks={setTracks} setConnection={setConnection}/>
      <ListTracks sortedTracks={sortedTracks} deleteTrack={deleteTrack} reset={reset}/>
      {connection != null && <Socket connection={connection}/>
      }
    </div>
  );
}

export default App;
