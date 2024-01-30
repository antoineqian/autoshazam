import * as React from "react"
import { useState } from 'react'
import ListTracks from '../components/ListTracks'
import FileUploadForm from '../components/FileUploadForm';

const pageStyles = {
  color: "#232129",
  padding: 96,
  fontFamily: "-apple-system, Roboto, sans-serif, serif",
}
const headingStyles = {
  marginTop: 0,
  marginBottom: 64,
  maxWidth: 320,
}
const paragraphStyles = {
  marginBottom: 48,
}
const codeStyles = {
  color: "#8A6534",
  padding: 4,
  backgroundColor: "#FFF4DB",
  fontSize: "1.25rem",
  borderRadius: 4,
}

const linkStyle = {
  color: "#8954A8",
  fontWeight: "bold",
  fontSize: 16,
  verticalAlign: "5%",
}

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
  


  return (
    <div>
      <FileUploadForm addTrack={addTrack}/>
      <ListTracks tracks={tracks} deleteTrack={deleteTrack} reset={reset}/>
    </div>
  );
  
  return (
    <main style={pageStyles}>
      <h1 style={headingStyles}>
        Congratulations
        <br />
      </h1>
      <p style={paragraphStyles}>
        Edit <code style={codeStyles}>src/pages/index.js</code> to see this page
        update in real-time. 😎
      </p>
    </main>
  )
}

export default IndexPage

export const Head = () => <title>Home Page</title>
