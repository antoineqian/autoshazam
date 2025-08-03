"use client";

import React, { useState } from "react";
import ListTracks from "@/components/ListTracks";
import FileUploadForm from "@/components/FileUploadForm";

import Head from "next/head";

export default function HomePage() {
  const [tracks, setTracks] = useState([]);

  const deleteTrack = (pos, index) => {
    setTracks((prevTracks) =>
      prevTracks.filter(
        (track) => !(track.position === pos && track.fileIndex === index)
      )
    );
  };

  const addTrack = (track) => {
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