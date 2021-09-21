export default class ImageProcessor {
    timerCallback() {
        if (this.isPaused) {
            return
        }
        this.computeFrame()
        setTimeout(() => {
            this.timerCallback()
        }, 15)
    }

    computeFrame() {
        this.temporaryCtx.drawImage(this.video, 0, 0, this.temporaryCanvas.width, this.temporaryCanvas.height)
        const frame = this.temporaryCtx.getImageData(0, 0, this.temporaryCanvas.width, this.temporaryCanvas.height)
        const length = frame.data.length
        for (let i = 0; i < length; i += 4) {
            const r = frame.data[i + 0]/255;
            const g = frame.data[i + 1]/255;
            const b = frame.data[i + 2]/255;
          
            const hsl = this.rgb2hsl(r, g, b)
            hsl[1] *= this.saturation
            hsl[2] *= this.brightness
            const rgb = this.hsl2rgb(hsl[0], hsl[1], hsl[2])
            frame.data[i] = rgb[0] * 255
            frame.data[i + 1] = rgb[1] * 255
            frame.data[i + 2] = rgb[2] * 255
          }
        this.ouputCtx.putImageData(frame, 0, 0)
      }

    turnSwitch(toOn) {
        this.isPaused = !toOn
        if (toOn) {
            this.timerCallback()
        }
    }

    constructor(video, outputCanvas) {
        this.outputCanvas = outputCanvas
        this.temporaryCanvas = document.createElement("canvas")
        this.video = video
        this.temporaryCtx = this.temporaryCanvas.getContext("2d")
        this.ouputCtx = outputCanvas.getContext("2d")
        video.addEventListener('loadeddata', () => {
            [this.temporaryCanvas, this.outputCanvas].forEach((element) => {
                element.width = video.videoWidth
                element.height = video.videoHeight
            })
            this.timerCallback()
          }, false)

        this.brightness = 1
        this.saturation = 1
        this.isPaused = false
    }

    rgb2hsl(r,g,b) {
        let v= Math.max(r,g,b), c=v-Math.min(r,g,b), f=(1-Math.abs(v+v-c-1)); 
        let h= c && ((v==r) ? (g-b)/c : ((v==g) ? 2+(b-r)/c : 4+(r-g)/c)); 
        return [60*(h<0?h+6:h), f ? c/f : 0, (v+v-c)/2];
    }

    hsl2rgb(h,s,l) 
    {
        let a= s*Math.min(l,1-l);
        let f= (n,k=(n+h/30)%12) => l - a*Math.max(Math.min(k-3,9-k,1),-1);
        return [f(0),f(8),f(4)];
    }   
}