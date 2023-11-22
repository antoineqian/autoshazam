import React, { useState } from 'react';
import axios from 'axios'

const FileUploadForm = ({setTracks}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [integerValue, setIntegerValue] = useState('');
  const [isValid, setIsValid] = useState(true);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
  };

  const handleInputChange = (event) => {
    const value = event.target.value; 

    setIntegerValue(value);
    // Check if the entered value is a valid integer
    setIsValid(/^\d+$/.test(value));
  };

  const handleUpload = async () => {
    // Handle file upload logic here
    if (!selectedFile){
      console.log("No file selected")
    }
    if(!isValid){
      console.log("Invalid input")
    }

    console.log('Uploading file:', selectedFile);

    const formData = new FormData();
    formData.append('file', selectedFile);

    const response = await axios.post(
      `http://localhost:8000/detect`,
      formData,
      { headers: {'Content-Type': 'multipart/form-data'}})

      if (response.status === 200) {
        console.log('Detection done')
        console.log(response)
        
        setTracks(response.data)
    }
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
        id="integerInput"
        value={integerValue}
        onChange={handleInputChange}
        placeholder="Enter an integer"
        style={{ borderColor: isValid ? 'inherit' : 'red' }}
      />
      <button onClick={handleUpload}>Upload</button>
    </div>
  );
};

export default FileUploadForm;