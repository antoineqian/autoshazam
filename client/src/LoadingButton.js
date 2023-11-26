import { ReactComponent as Loader } from './loader.svg'

const LoadingButton = ({ onSubmit, text, loading = false,}) => {
  return (
    <button className="submit-btn" onClick={onSubmit} disabled={loading}>
      {!loading ? text : <Loader className="spinner" />}
    </button>
  )
}

export default LoadingButton