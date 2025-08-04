'use client';


import React, { useState } from "react";
import ListTracks from "@/components/ListTracks";
import FileUploadForm from "@/components/FileUploadForm";

import Head from "next/head";
type Track = {
  position: number;
  fileIndex: number;
  [key: string]: any; // optional, for flexibility
};
export default function HomePage() {
  const [tracks, setTracks] = useState<Track[]>([]);

  const deleteTrack = (pos: number, index: number) => {
    setTracks((prevTracks) =>
      prevTracks.filter(
        (track) => !(track.position === pos && track.fileIndex === index)
      )
    );
  };

  const addTrack = (track: string): void => {
    setTracks((prevTracks) => [...prevTracks, JSON.parse(track)]);
  };

  const reset = () => {
    setTracks([]);
  };


  return (
    <>
      <Head>
        <title>Home Page</title>
      </Head>
      <div>

        <FileUploadForm addTrack={addTrack} setTracks={setTracks} />
        <ListTracks tracks={tracks} deleteTrack={deleteTrack} reset={reset} />
      </div>
    </>
  );
}

