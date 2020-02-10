export const workerFile = `
const { parentPort } = require('worker_threads')

parentPort.on('message', async message => {
  const response = {
    error: null,
    data: null
  }

  try {
    const [worker, isStatic, transferList] = message;
    eval(worker)
    // __executor__ is defined in worker
    if(isStatic){
      response.data = await __executor__(transferList)
      if(response.data instanceof ArrayBuffer){
        parentPort.postMessage(response, [response.data])
      } else {
        parentPort.postMessage(response)
      }
    } else {
      response.data = await __executor__()
      parentPort.postMessage(response)
    }
  } catch (err) {
    response.data = null
    response.error = {
      message: err.message,
      stack: err.stack
    }

    try {
      parentPort.postMessage(response)
    } catch (err) {
      console.error(err)
    }
  }
})
`