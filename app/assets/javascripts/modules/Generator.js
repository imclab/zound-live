(function (SynthModule) {

var OscillatorNode = zound.dummyAudioContext.createOscillator();

var GENERATOR_TYPES = [
  ["sine", OscillatorNode.SINE],
  ["triangle", OscillatorNode.TRIANGLE],
  ["square", OscillatorNode.SQUARE],
  ["saw", OscillatorNode.SAWTOOTH]
];
var GENERATOR_TYPES_NAME = _.pluck(GENERATOR_TYPES, 0);
var GENERATOR_TYPES_OSCVALUE = _.pluck(GENERATOR_TYPES, 1);

zound.modules.Generator = SynthModule.extend({
  initialize: function () {
    SynthModule.prototype.initialize.call(this);
    this.lastNote = null;
    this.properties.add([
      new zound.models.ModulePropertyRange({ id: "volume", min: 0, max: 100, title: "Volume", value: 50 }),
      new zound.models.ModulePropertySelect({ id: "type", values: GENERATOR_TYPES_NAME, title: "Type" }),
      new zound.models.ModulePropertyRange({ id: "attack", min: 0, max: 1000, title: "Attack", value: 10 }),
      new zound.models.ModulePropertyRange({ id: "decay", min: 0, max: 1000, title: "Decay", value: 200 }),
      new zound.models.ModulePropertyRange({ id: "release", min: 0, max: 4000, title: "Release", value: 200 }),
      new zound.models.ModulePropertyRange({ id: "decayVolume", min: 0, max: 100, title: "Decay Volume", value: 70 }),
      new zound.models.ModulePropertySelect({ id: "sustain", values: [ "off", "on" ], title: "Sustain", value: 1 }),
      new zound.models.ModulePropertyRange({ id: "finetune", min: -100, max: 100, title: "Finetune", value: 0 }),
      new zound.models.ModulePropertyRange({ id: "notedetune", min: -24, max: 24, title: "Note Detune", value: 0 }),
      new zound.models.ModulePropertyRange({ id: "glide", min: 0, max: 100, title: "Glide", value: 0 })
    ]);
    this._notes = [];

    this.properties.on("change:value", function (property, value) {
      var f = (function () {
        switch (property.id) {
          case "finetune": return function (data) {
            data.osc.detune.value = this.getDetune();
          };
          case "notedetune": return function (data) {
            data.osc.detune.value = this.getDetune();
          };
          // FIXME: other property to sync?
        }
      }());
      f && _.each(this._notes, f, this);
    }, this);
  },

  getDetune: function () {
    return this.properties.get("finetune").get("value") + 100*this.properties.get("notedetune").get("value");
  },

  noteOn: function (note, song, time) {
    var osc = song.ctx.createOscillator();
    var gain = song.ctx.createGain();
    osc.connect(gain);

    osc.type = GENERATOR_TYPES_OSCVALUE[this.properties.get("type").get("value")];
    osc.frequency.value = zound.AudioMath.noteToFrequency(note);
    osc.detune.value = this.getDetune();
    osc.start(time);

    gain.gain.value = this.properties.get("volume").getPercent();

    this.connect(gain, song);

    // Note envelope (Attack/Delay)
    var attackDuration = this.properties.get("attack").getValue() / 1000;
    var decayDuration = this.properties.get("decay").getValue() / 1000;
    var volume = this.properties.get("volume").getPercent();

    var data = {
      osc: osc,
      gain: gain,
      time: time,
      attackTime: time+attackDuration,
      decayTime: time+attackDuration+decayDuration
    };

    gain.gain.cancelScheduledValues(time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time+attackDuration);
    gain.gain.linearRampToValueAtTime(volume*this.properties.get("decayVolume").getPercent(), time+attackDuration+decayDuration);

    if (!this.properties.get("sustain").getValue()) {
      this.noteOff(data, song, time+attackDuration+decayDuration);
    }

    // Glide to note
    var glideDuration = this.properties.get("glide").getValue() / 100;
    if (glideDuration > 0 && this.lastNote) {
      osc.frequency.setValueAtTime(zound.AudioMath.noteToFrequency(this.lastNote), time);
      osc.frequency.linearRampToValueAtTime(zound.AudioMath.noteToFrequency(note), time + ((attackDuration + decayDuration) * glideDuration));
    }
    this.lastNote = note;

    song.execAtTime(_.bind(function () {
      this.trigger("noteOn");
    }, this), time);

    this._notes.push(data);
    return data;
  },

  noteOff: function (data, song, time) {
    var i = this._notes.indexOf(data);
    this._notes.splice(i, 1);
    var releaseTime = this.properties.get("release").getValue()/1000;
    var gain = data.gain.gain;
    gain.cancelScheduledValues(0);
    gain.setValueAtTime(gain.value, time);
    gain.linearRampToValueAtTime(0, time + releaseTime);
    data.osc.stop(time + releaseTime+1);
    song.execAtTime(_.bind(function () {
      this.disconnect(data.gain);
      this.trigger("noteOff");
    }, this), time+releaseTime+0.1);
  }
}, {
  GENERATOR_TYPES: GENERATOR_TYPES,
  GENERATOR_TYPES_NAME: GENERATOR_TYPES_NAME,
  GENERATOR_TYPES_OSCVALUE: GENERATOR_TYPES_OSCVALUE
});

}(zound.models.SynthModule));
