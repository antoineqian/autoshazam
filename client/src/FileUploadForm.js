import React, { useState } from 'react';
import axios from 'axios'
import LoadingButton from './LoadingButton'

const FileUploadForm = ({ setTracks }) => {
  const [fileList, setFileList] = useState([]);
  const [intervalValue, setIntervalValue] = useState(3);
  const [isValid, setIsValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState("file") // file, folder, url
  
  const selectMode = (mode) => {
    setMode(mode)
  }

  const handleFileChange = (event) => {
    const fileList = event.target.files;
    if (fileList.length > 0) {
      // Single file or folder / multiple files selected
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

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!isValid) {
      console.log("Invalid input")
    }
    setLoading(true);
    if (fileList.length > 0) {
      const formData = new FormData();
      fileList.forEach((file) => {
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

    setLoading(false);
    setFileList(null);
    resetInput()
  };


  return (
    <div className="file-upload-form">
      {/* <h2>Select a file or a folder here or paste a link</h2> */}
      <div className="search-options">
            <button 
              onClick={() => selectMode("file")}
              style={{backgroundColor: mode === "file" ? 'rgb(255, 255, 255)' : 'rgb(188, 188, 188)'}}
              >Single File</button>
            <button 
              onClick={() => selectMode("folder")}
              style={{backgroundColor: mode === "folder" ? 'rgb(255, 255, 255)' : 'rgb(188, 188, 188)'}}
              >Folder</button>
              <button 
              onClick={() => selectMode("url")}
              style={{backgroundColor: mode === "url" ? 'rgb(255, 255, 255)' : 'rgb(188, 188, 188)'}}
              >URL</button>
      </div>
      <br/>
      <form onSubmit={handleUpload}>
        {mode === "file" && (
        <input
          key={inputReset}
          type="file"
          accept=".mp3, .wav, audio/*"  // Adjust file types as needed
          onChange={handleFileChange}

        />
        )}
        {mode === "folder" && (
        <input
          key={inputReset}
          type="file"
          accept=".mp3, .wav, audio/*"  // Adjust file types as needed
          onChange={handleFileChange}
          directory="" 
          webkitdirectory=""
        />
        )}
        {mode === "url" && (
        <input
          type='url'
          value={url}
          onChange={handleUrlChange}
          placeholder='https://soundcloud.com/petervanhoesen/sync-live-at-bassiani-september-2022'
          required={false}
        />
        )}
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