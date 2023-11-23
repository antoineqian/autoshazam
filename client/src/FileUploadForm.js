import React, { useState } from 'react';
import axios from 'axios'

const FileUploadForm = ({setTracks}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [intervalValue, setIntervalValue] = useState(1);
  const [isValid, setIsValid] = useState(true);

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

  // const handleUpload = async () => {
  //   // Handle file upload logic here
  //   if (!selectedFile){
  //     console.log("No file selected")
  //   }
  //   if(!isValid){
  //     console.log("Invalid input")
  //   }

  //   console.log('Uploading file:', selectedFile);

  //   const formData = new FormData();
  //   formData.append('file', selectedFile);
  //   formData.append('interval', parseInt(intervalValue));

  //   const response = await axios.post(
  //     `http://localhost:8000/detect`,
  //     formData,
  //     { headers: {'Content-Type': 'multipart/form-data'}})

//     if (response.status === 200) {
//       console.log('Detection done')
//       console.log(response)
        
  //       setTracks(response.data)
  //   }
  // };

  const handleUpload = async () => {
    // Handle file upload logic here
    if (!selectedFile){
      console.log("No file selected")
    }
    if(!isValid){
      console.log("Invalid input")
    }

    var ws = new WebSocket("ws://localhost:8000/detect")
    ws.onmessage = function(event) {
      console.log(event.data)
  };

  console.log('Uploading file:', selectedFile);
  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('interval', parseInt(intervalValue));
  const response = await axios.post(
      `http://localhost:8000/process`,
      formData,
      { headers: {'Content-Type': 'multipart/form-data'}})

};



  return (
    <div className="file-upload-form">
      <h2>Upload your file here</h2>
      <input
        type="file"
        accept=".mp3, .wav"  // Adjust file types as needed
        onChange={handleFileChange}
      />
      <input
        type="text"
        id="intervalInput"
        value={intervalValue}
        onChange={handleInputChange}
        placeholder="Enter an interval"
        style={{ borderColor: isValid ? 'inherit' : 'red' }}
      />
      <button onClick={handleUpload}>Upload</button>
    </div>
  );
};

export default FileUploadForm;