import { ReactComponent as Loader } from './loader.svg'

const LoadingButton = ({ text, loading = false,}) => {
  return (
    <button className="submit-btn" type='submit' disabled={loading}>
      {!loading ? text : <Loader className="spinner" />}
    </button>
  )
}

export default LoadingButton