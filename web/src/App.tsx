import './App.css'

function App() {
  const handleBrowseCars = () => {
    // No-op route - placeholder for future implementation
    console.log('Browse Cars clicked')
  }

  const handleLogin = () => {
    // No-op route - placeholder for future implementation
    console.log('Login clicked')
  }

  return (
    <div className="app">
      <div className="container">
        <h1 className="title">CarExperts</h1>
        <p className="subtitle">Rent_a_Car Web Portal</p>
        <div className="button-group">
          <button className="btn btn-primary" onClick={handleBrowseCars}>
            Browse Cars
          </button>
          <button className="btn btn-secondary" onClick={handleLogin}>
            Login
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
