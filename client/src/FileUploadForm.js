import React, { useState } from 'react';
import axios from 'axios'
import LoadingButton from './LoadingButton'

const FileUploadForm = ({ setTracks }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [intervalValue, setIntervalValue] = useState(3);
  const [isValid, setIsValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');

  const handleFileChange = (event) => {
    const fileList = event.target.files;

    if (fileList.length === 1) {
      // Single file selected
      const file = fileList[0];
      setSelectedFile(file);
    } else {
      // Folder or multiple files selected
      const folderFiles = Array.from(fileList);
      setFileList(folderFiles);
    }
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
    if (!selectedFile) {
      console.log("No file selected")
    }
    if (!isValid) {
      console.log("Invalid input")
    }
    setLoading(true);
    if (fileList.length > 0) {
      console.log("Uploading folder:", fileList.length)
      const formData = new FormData();
      fileList.forEach((file, index) => {
        formData.append(`files`, file);
      });
      formData.append('interval', parseInt(intervalValue));
      const response = await axios.post(
        `http://localhost:8000/processFolder`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      if (response.status === 200) {
        console.log('Detection done')
        console.log(response)
      }
      setTracks(response.data)
    }

    // if (selectedFile) {
    //   console.log('Uploading file:', selectedFile);
    //   const formData = new FormData();
    //   formData.append('file', selectedFile);
    //   formData.append('interval', parseInt(intervalValue));
    //   const response = await axios.post(
    //     `http://localhost:8000/processFile`,
    //     formData,
    //     { headers: { 'Content-Type': 'multipart/form-data' } }
    //   )

    //   if (response.status === 200) {
    //     console.log('Detection done')
    //     console.log(response)
    //   }
    //   setTracks(response.data)
    // }
    // else {
    //   const formData = new FormData();
    //   formData.append('url', url);
    //   formData.append('interval', parseInt(intervalValue));
    //   const response = await axios.post(
    //     `http://localhost:8000/processUrl`,
    //     formData,
    //     { headers: { 'Content-Type': 'multipart/form-data' } }
    //   )
    // }
    setLoading(false);
    setSelectedFile(null);
    resetInput()
  };


  return (
    <div className="file-upload-form">
      <h2>Select a file or a folder here or paste a link</h2>
      <form onSubmit={handleUpload}>
        <input
          key={inputReset}
          type="file"
          accept=".mp3, .wav, audio/*"  // Adjust file types as needed
          onChange={handleFileChange}
          directory=""  // Enable directory selection
          webkitdirectory=""  // Enable directory selection for WebKit browsers (like Chrome)
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