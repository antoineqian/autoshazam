import React, { useState } from 'react';
import axios from 'axios'
import LoadingButton from './LoadingButton'

const FileUploadForm = ({tracks, addTrack}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [intervalValue, setIntervalValue] = useState(3);
  const [isValid, setIsValid] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
  };

  const handleInputChange = (event) => {
    const value = event.target.value; 

    setIntervalValue(value);
    // Check if the entered value is a valid interval
    setIsValid(/^\d+$/.test(value));
  };

  const [inputReset, setInputReset] = useState('')
  // Assigining a new key will force re-render
  const resetInput = () => {
    let randomString = Math.random().toString(36);
    setInputReset(randomString)
  };

  const handleUpload = async () => {
  // Handle file upload logic here
  if (!selectedFile){
    console.log("No file selected")
  }
  if(!isValid){
    console.log("Invalid input")
  }
  setLoading(true);

  var ws = new WebSocket("ws://localhost:8000/detect")
  ws.onmessage = function(event) {
      addTrack(JSON.parse(event.data))
  };

  console.log('Uploading file:', selectedFile);
  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('interval', parseInt(intervalValue));
  await axios.post(
      `http://localhost:8000/process`,
      formData,
      { headers: {'Content-Type': 'multipart/form-data'}})
  
  setLoading(false);
  setSelectedFile(null);
  resetInput()
  };


  return (
    <div className="file-upload-form">
      <h2>Upload your file here</h2>
      <form onSubmit={handleUpload}>
      <input
        key={inputReset}
        type="file"
        accept=".mp3, .wav, audio/*"  // Adjust file types as needed
        onChange={handleFileChange}
        // multiple="false"
        required={true}
      />
      <input
        type="text"
        id="intervalInput"
        value={intervalValue}
        onChange={handleInputChange}
        placeholder="Enter an interval"
        style={{ borderColor: isValid ? 'inherit' : 'red' }}
      />
      <LoadingButton text="Submit" onSubmit={handleUpload} loading={loading} />
      </form>
    </div>
  );
};

export default FileUploadForm;