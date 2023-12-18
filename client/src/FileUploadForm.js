import React, { useState } from 'react';
import axios from 'axios'
import LoadingButton from './LoadingButton'

const FileUploadForm = ({setTracks}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [intervalValue, setIntervalValue] = useState(3);
  const [isValid, setIsValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
  };

  const handleIntervalChange = (event) => {
    const value = event.target.value; 

    setIntervalValue(value);
    // Check if the entered value is a valid interval
    setIsValid(/^\d+$/.test(value));
  };
  
  const handleUrlChange = (event) => {
    const value = event.target.value;
    setUrl(value);
  };
  
  const [inputReset, setInputReset] = useState('')
  // Assigining a new key will force re-render
  const resetInput = () => {
    let randomString = Math.random().toString(36);
    setInputReset(randomString)
  };

  const handleUpload = async () => {
    // Handle file upload logic here
    if (!selectedFile ){
      console.log("No file selected")
    }
    if(!isValid){
      console.log("Invalid input")
    }
    setLoading(true);
    if (selectedFile) {
      console.log('Uploading file:', selectedFile);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('interval', parseInt(intervalValue));
      const response = await axios.post(
          `http://localhost:8000/processFile`,
          formData,
          { headers: {'Content-Type': 'multipart/form-data'}}
      )
    
      if (response.status === 200) {
        console.log('Detection done')
        console.log(response)
      }
      setTracks(response.data)}
    else {
      const formData = new FormData();
      formData.append('url', url);
      formData.append('interval', parseInt(intervalValue));
      const response = await axios.post(
        `http://localhost:8000/processUrl`,
        formData,
        { headers: {'Content-Type': 'multipart/form-data'}}
      )
    }
    setLoading(false);
    setSelectedFile(null);
    resetInput()
  };


  return (
    <div className="file-upload-form">
      <h2>Upload your file here or paste a link</h2>
      <form onSubmit={handleUpload}>
      <input
        key={inputReset}
        type="file"
        accept=".mp3, .wav, audio/*"  // Adjust file types as needed
        onChange={handleFileChange}
      />
      <input 
        type='url'
        value={url}
        onChange={handleUrlChange}
        placeholder='https://soundcloud.com/petervanhoesen/sync-live-at-bassiani-september-2022'
        required={false}
      />
      <input
        type="text"
        id="intervalInput"
        value={intervalValue}
        onChange={handleIntervalChange}
        placeholder="Enter an interval"
        style={{ borderColor: isValid ? 'inherit' : 'red' }}
      />
      <LoadingButton text="Submit" onSubmit={handleUpload} loading={loading} />
      </form>
    </div>
  );
};

export default FileUploadForm;