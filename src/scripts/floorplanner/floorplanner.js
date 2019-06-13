import $ from 'jquery';
import {EventDispatcher} from 'three';
import {cmPerPixel, pixelsPerCm, Dimensioning} from '../core/dimensioning.js';
import {configDimUnit, Configuration} from '../core/configuration.js';
import {EVENT_MODE_RESET, EVENT_LOADED} from '../core/events.js';
import {EVENT_CORNER_2D_HOVER, EVENT_WALL_2D_HOVER, EVENT_ROOM_2D_HOVER} from '../core/events.js';
import {EVENT_CORNER_2D_DOUBLE_CLICKED, EVENT_ROOM_2D_DOUBLE_CLICKED, EVENT_WALL_2D_DOUBLE_CLICKED} from '../core/events.js';
import {EVENT_NOTHING_CLICKED} from '../core/events.js';
import {FloorplannerView2D, floorplannerModes} from './floorplanner_view.js';

/** how much will we move a corner to make a wall axis aligned (cm) */
export const snapTolerance = 25;
/**
 * The Floorplanner implements an interactive tool for creation of floorplans in
 * 2D.
 */
export class Floorplanner2D extends EventDispatcher
{
	/** */
	constructor(canvas, floorplan)
	{
		super();
		/** */
		this.mode = 0;
		/** */
		this.activeWall = null;
		/** */
		this.activeCorner = null;
		/** */
		this.activeRoom = null;
		/** */
		this.originX = 0;
		/** */
		this.originY = 0;
		/** drawing state */
		this.targetX = 0;
		/** drawing state */
		this.targetY = 0;
		/** drawing state */
		this.lastNode = null;
		/** */
		this.wallWidth = 0;
		/** */
		this.modeResetCallbacks = null;

		/** */
		this.mouseDown = false;
		/** */
		this.mouseMoved = false;
		/** in ThreeJS coords */
		this.mouseX = 0;
		/** in ThreeJS coords */
		this.mouseY = 0;
		/** in ThreeJS coords */
		this.rawMouseX = 0;
		/** in ThreeJS coords */
		this.rawMouseY = 0;
		/** mouse position at last click */
		this.lastX = 0;
		/** mouse position at last click */
		this.lastY = 0;

		this.canvas = canvas;
		this.floorplan = floorplan;
		this.canvasElement = $('#' + canvas);
		this.view = new FloorplannerView2D(this.floorplan, this, canvas);

//		var cmPerFoot = cmPerFoot;
//		var pixelsPerFoot = pixelsPerFoot;
		this.cmPerPixel = cmPerPixel;
		this.pixelsPerCm = pixelsPerCm;

		this.wallWidth = 10.0 * this.pixelsPerCm;
		this.gridsnapmode = false;
		this.shiftkey = false;
		// Initialization:

		this.setMode(floorplannerModes.MOVE);

		var scope = this;
		this.canvasElement.bind('touchstart mousedown', (event) => {scope.mousedown(event);});
		this.canvasElement.bind('touchmove mousemove', (event) => {scope.mousemove(event);});
		this.canvasElement.bind('touchend mouseup', (event) => {scope.mouseup(event);});
		this.canvasElement.bind('mouseleave', (event) => {scope.mouseleave(event);});
		this.canvasElement.bind('dblclick', (event) => {scope.doubleclick(event);});

		document.addEventListener('keyup', function(event){scope.keyUp(event)});
		document.addEventListener('keydown', function(event){scope.keyDown(event)});
		floorplan.addEventListener(EVENT_LOADED, function(){scope.reset();});
	}

	get carbonSheet()
	{
		return this.view.carbonSheet;
	}

	doubleclick()
	{
			var userinput, cid;
			var units = Configuration.getStringValue(configDimUnit);
			if(this.activeCorner)
			{
        this.floorplan.dispatchEvent({type:EVENT_CORNER_2D_DOUBLE_CLICKED, item: this.activeCorner});
				cid = this.activeCorner.id;
				userinput = window.prompt(`Elevation at this point (in ${units},\n${cid}): `, Dimensioning.cmToMeasureRaw(this.activeCorner.elevation));
				if(userinput != null)
				{
					this.activeCorner.elevation = Number(userinput);
				}

			}
      else if(this.activeWall)
      {
          this.floorplan.dispatchEvent({type:EVENT_WALL_2D_DOUBLE_CLICKED, item: this.activeWall});
      }
			else if(this.activeRoom)
			{
          this.floorplan.dispatchEvent({type:EVENT_ROOM_2D_DOUBLE_CLICKED, item: this.activeRoom});
					userinput = window.prompt('Enter a name for this Room: ', this.activeRoom.name);
					if(userinput != null)
					{
						this.activeRoom.name = userinput;
					}
					this.view.draw();
			}
	}

	keyUp(e)
	{
		if (e.keyCode == 27)
		{
			this.escapeKey();
		}
		this.gridsnapmode = false;
		this.shiftkey = false;
	}

	keyDown(e)
	{
		if(e.shiftKey || e.keyCode == 16)
		{
			this.shiftkey = true;
		}
		this.gridsnapmode = this.shiftkey;
	}

	/** */
	escapeKey()
	{
		this.setMode(floorplannerModes.MOVE);
	}

	/** */
	updateTarget()
	{
		if (this.mode == floorplannerModes.DRAW && this.lastNode)
		{
			if (Math.abs(this.mouseX - this.lastNode.x) < snapTolerance)
			{
				this.targetX = this.lastNode.x;
			}
			else
			{
				this.targetX = this.mouseX;
			}
			if (Math.abs(this.mouseY - this.lastNode.y) < snapTolerance)
			{
				this.targetY = this.lastNode.y;
			}
			else
			{
				this.targetY = this.mouseY;
			}
		}
		else
		{
			this.targetX = this.mouseX;
			this.targetY = this.mouseY;
		}

		this.view.draw();
	}

	/** */
	mousedown(event)
	{
		this.mouseDown = true;
		this.mouseMoved = false;
		if(event.touches)
		{
			this.rawMouseX = event.touches[0].clientX;
			this.rawMouseY = event.touches[0].clientY;
		}

		this.lastX = this.rawMouseX;
		this.lastY = this.rawMouseY;

		// delete
		if (this.mode == floorplannerModes.DELETE)
		{
			if (this.activeCorner)
			{
				this.activeCorner.removeAll();
			}
			else if (this.activeWall)
			{
				this.activeWall.remove();
			}
			else
			{
				//Continue the mode of deleting walls, this is necessary for deleting multiple walls
//				this.setMode(floorplannerModes.MOVE);
			}
		}

    if(this.activeCorner == null && this.activeWall == null && this.activeRoom == null)
    {
        this.floorplan.dispatchEvent({type:EVENT_NOTHING_CLICKED});
    }
	}

	/** */
	mousemove(event)
	{
		this.mouseMoved = true;

		if(event.touches)
		{
			event = event.touches[0];
		}

		// update mouse
		this.rawMouseX = event.clientX;
		this.rawMouseY = event.clientY;

		this.mouseX = (event.clientX - this.canvasElement.offset().left)  * this.cmPerPixel + this.originX * this.cmPerPixel;
		this.mouseY = (event.clientY - this.canvasElement.offset().top) * this.cmPerPixel + this.originY * this.cmPerPixel;


		// update target (snapped position of actual mouse)
		if (this.mode == floorplannerModes.DRAW || (this.mode == floorplannerModes.MOVE && this.mouseDown))
		{
			this.updateTarget();
		}

		// update object target
		if (this.mode != floorplannerModes.DRAW && !this.mouseDown)
		{
			var hoverCorner = this.floorplan.overlappedCorner(this.mouseX, this.mouseY);
			var hoverWall = this.floorplan.overlappedWall(this.mouseX, this.mouseY);
			var hoverRoom = this.floorplan.overlappedRoom(this.mouseX, this.mouseY);
			var draw = false;
			if (hoverCorner != this.activeCorner)
			{
				this.activeCorner = hoverCorner;
        this.floorplan.dispatchEvent({type:EVENT_CORNER_2D_HOVER, item: hoverCorner});
				draw = true;
			}
			// corner takes precendence
			if (this.activeCorner == null)
			{
				if (hoverWall != this.activeWall)
				{
					this.activeWall = hoverWall;
          this.floorplan.dispatchEvent({type:EVENT_WALL_2D_HOVER, item: hoverWall});
					draw = true;
				}
			}
			else
			{
				this.activeWall = null;
			}

			this.activeRoom = hoverRoom;
      if(this.activeCorner == null && this.activeWall == null && this.activeRoom !=null)
      {
          this.floorplan.dispatchEvent({type:EVENT_ROOM_2D_HOVER, item: hoverRoom});
      }


			if (draw)
			{
				this.view.draw();
			}
		}

		// panning
		if (this.mouseDown && !this.activeCorner && !this.activeWall)
		{
			this.originX += (this.lastX - this.rawMouseX);
			this.originY += (this.lastY - this.rawMouseY);
			this.lastX = this.rawMouseX;
			this.lastY = this.rawMouseY;
			this.view.draw();
		}

		// dragging
		if (this.mode == floorplannerModes.MOVE && this.mouseDown)
		{
			if (this.activeCorner)
			{
				if(this.gridsnapmode)
				{
						var mx = (Math.abs(this.mouseX - this.activeCorner.x) < snapTolerance) ? this.activeCorner.x : this.mouseX;
						var my = (Math.abs(this.mouseY - this.activeCorner.y) < snapTolerance) ? this.activeCorner.y : this.mouseY;
						this.activeCorner.move(Math.round(mx), Math.round(my));
				}
				else
				{
						this.activeCorner.move(this.mouseX, this.mouseY);
				}
				if(this.shiftkey)
				{
					this.activeCorner.snapToAxis(snapTolerance);
				}
			}
			else if (this.activeWall)
			{
				this.activeWall.relativeMove((this.rawMouseX - this.lastX) * this.cmPerPixel, (this.rawMouseY - this.lastY) * this.cmPerPixel);
				if(this.gridsnapmode)
				{
					this.activeWall.snapToAxis(snapTolerance);
				}
				this.lastX = this.rawMouseX;
				this.lastY = this.rawMouseY;
			}
			this.view.draw();
		}
	}

	/** */
	mouseup()
	{
		this.mouseDown = false;

		// drawing
		if (this.mode == floorplannerModes.DRAW && !this.mouseMoved)
		{
			// This creates the corner already
			var corner = this.floorplan.newCorner(this.targetX, this.targetY);

			// further create a newWall based on the newly inserted corners
			// (one in the above line and the other in the previous mouse action
			// of start drawing a new wall)
			if (this.lastNode != null)
			{
				this.floorplan.newWall(this.lastNode, corner);
				this.floorplan.newWallsForIntersections(this.lastNode, corner);
				this.view.draw();
			}
			if (corner.mergeWithIntersected() && this.lastNode != null)
			{
				this.setMode(floorplannerModes.MOVE);
			}
			this.lastNode = corner;
		}
		else
		{
			if(this.activeCorner != null)
			{
					this.activeCorner.updateAttachedRooms();
			}
			if(this.activeWall != null)
			{
					this.activeWall.updateAttachedRooms();
			}
		}
	}

	/** */
	mouseleave()
	{
		this.mouseDown = false;
		// scope.setMode(scope.modes.MOVE);
	}

	/** */
	reset()
	{
		this.view.carbonSheet.clear();
		this.resizeView();
		this.setMode(floorplannerModes.MOVE);
		this.resetOrigin();
		this.view.draw();
	}

	/** */
	resizeView()
	{
		this.view.handleWindowResize();
	}

	/** */
	setMode(mode)
	{
		this.lastNode = null;
		this.mode = mode;
		this.dispatchEvent({type:EVENT_MODE_RESET, mode: mode});
		// this.modeResetCallbacks.fire(mode);
		this.updateTarget();
	}

	/** Sets the origin so that floorplan is centered */
	resetOrigin()
	{
		var centerX = this.canvasElement.innerWidth() / 2.0;
		var centerY = this.canvasElement.innerHeight() / 2.0;
		var centerFloorplan = this.floorplan.getCenter();
		this.originX = centerFloorplan.x * this.pixelsPerCm - centerX;
		this.originY = centerFloorplan.z * this.pixelsPerCm - centerY;
	}

	/** Convert from THREEjs coords to canvas coords. */
	convertX(x)
	{
		return (x - (this.originX * this.cmPerPixel)) * this.pixelsPerCm;
	}

	/** Convert from THREEjs coords to canvas coords. */
	convertY(y)
	{
		return (y - (this.originY * this.cmPerPixel)) * this.pixelsPerCm;
	}
}
