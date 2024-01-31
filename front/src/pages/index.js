import * as React from "react"
import { useState } from 'react'
import ListTracks from '../components/ListTracks'
import FileUploadForm from '../components/FileUploadForm';
import { useAuth } from "react-use-auth";

const IndexPage = () => {
  
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
  
  const Login = () => {
    const { isAuthenticated, login, logout } = useAuth();
    if (isAuthenticated()) {
        return <button onClick={logout}>Logout</button>;
    } else {
        return <button onClick={login}>Login</button>;
    }
};

  return (
    <div>
      <Login></Login>
      <FileUploadForm addTrack={addTrack}/>
      <ListTracks tracks={tracks} deleteTrack={deleteTrack} reset={reset}/>
    </div>
  );
  
}

export default IndexPage

export const Head = () => <title>Home Page</title>
