import { ReactComponent as Loader } from '../images/loader.svg'
import React from 'react'

const LoadingButton = ({ text, loading = false,}) => {
  return (
    <button className="btn submit-btn" type='submit' disabled={loading}>
      {!loading ? text : "Loading"}
    </button>
  )
}

export default LoadingButton