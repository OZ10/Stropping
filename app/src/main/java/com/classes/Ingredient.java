package com.classes;

/**
 * Created by Austen on 01/08/2016.
 */
public class Ingredient extends QuantityItem {

    private int defaultValue;
    private boolean favourite;
    private boolean essential;
    private boolean added;
    private boolean hidden = false;
    private Boolean isSelected;

   public int getDefaultValue(){
        return defaultValue;
    }

    public void setDefaultValue(int defaultValue){
        this.defaultValue = defaultValue;
    }

    public boolean getFavourite(){
        return favourite;
    }

    public void setFavourite(int favourite){
        this.favourite = ReturnBoolean(favourite);
    }

    public boolean getEssential(){
        return essential;
    }

    public void setEssential(int essential){
        this.essential = ReturnBoolean(essential);
    }

   public boolean getAdded(){
        return added;
    }

    public void setadded(int added){
        this.added = ReturnBoolean(added);
    }

    public boolean getHidden(){
        return hidden;
    }

    public void setHidden(int hidden){
        this.hidden = ReturnBoolean(hidden);
    }

    private boolean ReturnBoolean(int value) {
        if (value == 0){
            return false;
        }
        else{
            return true;
        }
    }

    public Boolean getIsSelected()
    { return isSelected; }

    public void setIsSelected(Boolean value)
    { isSelected = value; }

    // Toggles whatever the isSelected value is currently set to
    public void setIsSelected()
    { isSelected = !isSelected; }

    @Override
    public String toString()
    {
        return name;
    }

    public Ingredient()
    {
        this.isSelected = false;
    }

    public Ingredient(String name, Boolean isSelected)
    {
        this.name = name;
        this.isSelected = isSelected;
    }
}
