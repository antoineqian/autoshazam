'use client';


import React, { useState } from "react";
import ListTracks from "@/components/ListTracks";
import FileUploadForm from "@/components/FileUploadForm";

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
    <section className="flex-1 p-4 lg:p-8">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
          Let's dig !
        </h1>
        <FileUploadForm addTrack={addTrack} setTracks={setTracks} />
        <ListTracks tracks={tracks} deleteTrack={deleteTrack} reset={reset} />
      </div>
    </section>
  );
}

